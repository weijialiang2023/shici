/* 拾词付费产品配置。接入正式支付后只替换购买地址，不改打印功能。 */
(function () {
  'use strict';

  window.SHICI_PREMIUM_CONFIG = {
    memoryWall: {
      productName: '记忆墙打印包',
      priceLabel: '¥19',
      regularPriceLabel: '¥29',
      purchaseUrl: '',
      supportUrl: 'feedback.html?type=memory-wall',
      licensePlaceholder: '粘贴购买后收到的授权码'
    }
  };
})();
