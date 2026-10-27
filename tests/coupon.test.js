const { CouponError, applyCoupon } = require('../src/utils/coupon');

describe('Coupon module', () => {
  it('未使用優惠碼時不折扣', () => {
    expect(applyCoupon({ subtotal: 800 })).toEqual({
      couponCode: null,
      discount: 0,
      discountedSubtotal: 800
    });
  });

  it('FLOWER100 不分大小寫，滿 800 元折抵 100 元', () => {
    expect(applyCoupon({ subtotal: 800, couponCode: 'flower100' })).toEqual({
      couponCode: 'FLOWER100',
      discount: 100,
      discountedSubtotal: 700
    });
  });

  it('FLOWER100 未達門檻時拒絕使用', () => {
    expect(() => applyCoupon({ subtotal: 799, couponCode: 'FLOWER100' }))
      .toThrow(CouponError);
  });

  it.each([
    [1000, 100],
    [1234, 123],
    [3500, 300]
  ])('SPRING10 小計 %i 元時折抵 %i 元', (subtotal, discount) => {
    expect(applyCoupon({ subtotal, couponCode: 'SPRING10' })).toMatchObject({
      couponCode: 'SPRING10',
      discount,
      discountedSubtotal: subtotal - discount
    });
  });

  it.each(['SUMMER50', 'NOT-A-COUPON'])('拒絕無法使用的優惠碼 %s', couponCode => {
    expect(() => applyCoupon({ subtotal: 1000, couponCode })).toThrow(CouponError);
  });

  it('拒絕非字串優惠碼', () => {
    expect(() => applyCoupon({ subtotal: 1000, couponCode: ['FLOWER100'] }))
      .toThrow('優惠碼格式不正確');
  });
});
