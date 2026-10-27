const COUPONS = Object.freeze({
  FLOWER100: Object.freeze({ type: 'fixed', amount: 100, minSubtotal: 800, active: true }),
  SPRING10: Object.freeze({ type: 'percentage', rate: 0.1, maxDiscount: 300, active: true }),
  SUMMER50: Object.freeze({ type: 'fixed', amount: 50, minSubtotal: 0, active: false })
});

class CouponError extends Error {}

function applyCoupon({ subtotal, couponCode }) {
  if (!Number.isInteger(subtotal) || subtotal < 0) {
    throw new TypeError('subtotal 必須為非負整數');
  }

  if (couponCode === undefined || couponCode === null || couponCode === '') {
    return { couponCode: null, discount: 0, discountedSubtotal: subtotal };
  }

  if (typeof couponCode !== 'string') {
    throw new CouponError('優惠碼格式不正確');
  }

  const normalizedCode = couponCode.trim().toUpperCase();
  if (normalizedCode === '') {
    return { couponCode: null, discount: 0, discountedSubtotal: subtotal };
  }

  const rule = COUPONS[normalizedCode];
  if (!rule) {
    throw new CouponError('優惠碼無效');
  }
  if (!rule.active) {
    throw new CouponError('優惠碼已失效');
  }
  if (subtotal < (rule.minSubtotal || 0)) {
    throw new CouponError(`商品小計未達優惠碼 ${normalizedCode} 的使用門檻`);
  }

  const discount = rule.type === 'percentage'
    ? Math.min(Math.round(subtotal * rule.rate), rule.maxDiscount)
    : Math.min(rule.amount, subtotal);

  return {
    couponCode: normalizedCode,
    discount,
    discountedSubtotal: subtotal - discount
  };
}

module.exports = {
  COUPONS,
  CouponError,
  applyCoupon
};
