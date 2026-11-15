#!/usr/bin/env python3
"""拾词 · 本机静态服务器（仅 127.0.0.1）。

静态站点 + 一个很小的本机学习记录备份接口：
  GET  /api/state  读取最近一次自动备份
  POST /api/state  原子写入备份（保留上一版 .prev.json）
  GET  /api/health 查看长期存储状态
  GET  /api/history 查看每日/定时快照数量
  GET  /api/export 下载完整记录

备份文件不在站点目录内，避免被静态服务器直接下载。
"""
import json
import os
import threading
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get('SHICI_PORT', '4173'))
STATE_DIR = Path(os.environ.get(
    'SHICI_STATE_DIR',
    str(Path.home() / 'Library' / 'Application Support' / 'Shici' / 'progress')
))
STATE_FILE = STATE_DIR / 'state.json'
PREV_FILE = STATE_DIR / 'state.prev.json'
DAILY_DIR = STATE_DIR / 'history' / 'daily'
CHECKPOINT_DIR = STATE_DIR / 'history' / 'checkpoints'
MAX_STATE_BYTES = 20 * 1024 * 1024
APP_VERSION = '2.0.0'
_write_lock = threading.Lock()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _state_metadata(self):
        daily = sorted(DAILY_DIR.glob('*.json')) if DAILY_DIR.exists() else []
        checkpoints = sorted(CHECKPOINT_DIR.glob('*.json')) if CHECKPOINT_DIR.exists() else []
        updated_at = None
        if STATE_FILE.exists():
            try:
                updated_at = datetime.fromtimestamp(STATE_FILE.stat().st_mtime).astimezone().isoformat(timespec='seconds')
            except OSError:
                pass
        return {
            'app': '拾词',
            'version': APP_VERSION,
            'ok': True,
            'stateExists': STATE_FILE.exists(),
            'stateBytes': STATE_FILE.stat().st_size if STATE_FILE.exists() else 0,
            'lastWriteAt': updated_at,
            'dailySnapshots': len(daily),
            'checkpoints': len(checkpoints),
            'oldestDaily': daily[0].name if daily else None,
            'latestDaily': daily[-1].name if daily else None,
        }

    def _write_snapshot(self, target, raw):
        if target.exists():
            return False
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix('.tmp')
        with tmp.open('wb') as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, target)
        return True

    def _write_state(self, raw):
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        DAILY_DIR.mkdir(parents=True, exist_ok=True)
        CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
        today = datetime.now().astimezone().date().isoformat()
        hour = datetime.now().astimezone().hour
        checkpoint_block = f'{today}T{hour // 6 * 6:02d}'

        with _write_lock:
            if STATE_FILE.exists():
                try:
                    os.replace(STATE_FILE, PREV_FILE)
                except OSError:
                    pass
            tmp = STATE_FILE.with_suffix('.tmp')
            with tmp.open('wb') as handle:
                handle.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp, STATE_FILE)

            daily_created = self._write_snapshot(DAILY_DIR / f'{today}.json', raw)
            checkpoint_created = self._write_snapshot(CHECKPOINT_DIR / f'{checkpoint_block}.json', raw)

            # Daily snapshots are kept forever. Six-hour checkpoints cover the
            # most recent 90 days and are safe to prune because daily copies stay.
            cutoff = datetime.now().astimezone() - timedelta(days=90)
            for snapshot in CHECKPOINT_DIR.glob('*.json'):
                try:
                    if datetime.fromtimestamp(snapshot.stat().st_mtime).astimezone() < cutoff:
                        snapshot.unlink()
                except OSError:
                    pass
        return daily_created, checkpoint_created

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/api/health':
            self._json(200, self._state_metadata())
            return
        if path == '/api/history':
            meta = self._state_metadata()
            meta['daily'] = [path.name for path in sorted(DAILY_DIR.glob('*.json'))] if DAILY_DIR.exists() else []
            meta['checkpointFiles'] = [path.name for path in sorted(CHECKPOINT_DIR.glob('*.json'))] if CHECKPOINT_DIR.exists() else []
            self._json(200, meta)
            return
        if path == '/api/export':
            if not STATE_FILE.exists():
                self._json(404, {'ok': False, 'error': 'no backup yet'})
                return
            try:
                data = STATE_FILE.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Disposition', 'attachment; filename="shici-backup.json"')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except OSError as error:
                self._json(500, {'ok': False, 'error': str(error)})
            return
        if path == '/api/state':
            if not STATE_FILE.exists():
                self._json(404, {'ok': False, 'error': 'no backup yet'})
                return
            try:
                data = STATE_FILE.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except OSError as error:
                self._json(500, {'ok': False, 'error': str(error)})
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split('?', 1)[0] != '/api/state':
            self._json(404, {'ok': False, 'error': 'not found'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if length <= 0:
            self._json(400, {'ok': False, 'error': 'empty body'})
            return
        if length > MAX_STATE_BYTES:
            self._json(413, {'ok': False, 'error': 'state too large'})
            return
        try:
            raw = self.rfile.read(length)
            state = json.loads(raw.decode('utf-8'))
            if not isinstance(state, dict) or not isinstance(state.get('words'), dict):
                raise ValueError('invalid state shape')
        except Exception as error:
            self._json(400, {'ok': False, 'error': str(error)})
            return

        daily_created, checkpoint_created = self._write_state(raw)
        self._json(200, {
            'ok': True,
            'bytes': len(raw),
            'savedAt': state.get('meta', {}).get('updatedAt'),
            'dailySnapshotCreated': daily_created,
            'checkpointCreated': checkpoint_created,
        })


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'Shici server: http://127.0.0.1:{PORT}/  (root: {ROOT})', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
