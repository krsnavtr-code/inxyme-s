/**
 * Shared backend pricing & discount helpers for offered-price pricing snapshots.
 * Stores the course fee at the time an offered price is set so future catalog price changes
 * do not distort the student's agreed fee or calculated discount percentage.
 */

export const USER_DISCOUNT_FIELDS =
  "discount discountCourseId discountCourseTitle discountCoursePrice discountedCoursePrice discountAmount discountUpdatedAt courseDiscounts";

/**
 * Resolve current selling fee (INR) of a Course document.
 */
export const resolveCourseBasePrice = (courseObj) => {
  if (!courseObj || courseObj.isFree) return 0;
  const price = Number(courseObj.price);
  if (!Number.isNaN(price) && price > 0) return price;
  const originalPrice = Number(courseObj.originalPrice);
  if (!Number.isNaN(originalPrice) && originalPrice > 0) return originalPrice;
  return !Number.isNaN(price) && price >= 0 ? price : 0;
};

/**
 * Compute discount amount (INR) and high-precision percentage (0-100) from
 * the course price captured at save time and the student's offered price.
 */
export const computeDiscountFromOfferedPrice = (originalCoursePrice, offeredPrice) => {
  const basePrice = Math.max(0, Number(originalCoursePrice) || 0);
  const agreedPrice = Math.max(0, Number(offeredPrice) || 0);

  if (basePrice <= 0) {
    return {
      originalCoursePrice: 0,
      offeredPrice: Number(agreedPrice.toFixed(2)),
      discountAmount: 0,
      discountPercent: 0,
    };
  }

  const clampedOffered = Math.min(basePrice, agreedPrice);
  const discountAmount = Number((basePrice - clampedOffered).toFixed(2));
  const rawPercent = ((basePrice - clampedOffered) / basePrice) * 100;
  const discountPercent = Math.min(100, Math.max(0, Number(rawPercent.toFixed(6))));

  return {
    originalCoursePrice: Number(basePrice.toFixed(2)),
    offeredPrice: Number(clampedOffered.toFixed(2)),
    discountAmount,
    discountPercent,
  };
};

/**
 * Build a plain response/projection object for user pricing fields.
 */
export const pickUserPricingFields = (user) => {
  if (!user) return {};
  return {
    discount: Number(user.discount || 0),
    discountCourseId: user.discountCourseId || null,
    discountCourseTitle: user.discountCourseTitle || "",
    discountCoursePrice: Number(user.discountCoursePrice || 0),
    discountedCoursePrice:
      user.discountedCoursePrice !== undefined && user.discountedCoursePrice !== null
        ? Number(user.discountedCoursePrice)
        : null,
    discountAmount: Number(user.discountAmount || 0),
    discountUpdatedAt: user.discountUpdatedAt || null,
    courseDiscounts: Array.isArray(user.courseDiscounts) ? user.courseDiscounts : [],
  };
};

/**
 * Find the matching saved course pricing snapshot on a User record for a courseId / courseTitle.
 */
export const findMatchingCoursePricingSnapshot = (
  userObj,
  courseId = null,
  courseTitle = ""
) => {
  if (!userObj) return null;

  const targetId = courseId?._id ? String(courseId._id) : courseId ? String(courseId) : "";
  const targetTitle = String(courseTitle || "").trim().toLowerCase();

  const entries = Array.isArray(userObj.courseDiscounts) ? userObj.courseDiscounts : [];
  if (entries.length > 0) {
    if (targetId) {
      const byId = entries.find(
        (item) => item && item.courseId && String(item.courseId) === targetId
      );
      if (byId && Number(byId.originalCoursePrice) > 0) {
        return byId;
      }
    }
    if (targetTitle) {
      const byTitle = entries.find(
        (item) =>
          item &&
          item.courseTitle &&
          String(item.courseTitle).trim().toLowerCase() === targetTitle
      );
      if (byTitle && Number(byTitle.originalCoursePrice) > 0) {
        return byTitle;
      }
    }
  }

  const hasTopLevelSnapshot =
    Number(userObj.discountCoursePrice) > 0 &&
    userObj.discountedCoursePrice !== undefined &&
    userObj.discountedCoursePrice !== null;

  if (!hasTopLevelSnapshot) return null;

  const snapId = userObj.discountCourseId?._id
    ? String(userObj.discountCourseId._id)
    : userObj.discountCourseId
      ? String(userObj.discountCourseId)
      : "";
  const snapTitle = String(userObj.discountCourseTitle || "").trim().toLowerCase();

  const matchesById = Boolean(targetId && snapId && targetId === snapId);
  const matchesByTitle = Boolean(targetTitle && snapTitle && targetTitle === snapTitle);
  const matchesGenericCustom = !targetId && !snapId && (!snapTitle || snapTitle === targetTitle);

  if (matchesById || matchesByTitle || matchesGenericCustom) {
    return {
      courseId: userObj.discountCourseId || null,
      courseTitle: userObj.discountCourseTitle || "",
      originalCoursePrice: Number(userObj.discountCoursePrice),
      offeredPrice: Number(userObj.discountedCoursePrice),
      discountAmount: Number(
        userObj.discountAmount ||
          Math.max(0, Number(userObj.discountCoursePrice) - Number(userObj.discountedCoursePrice))
      ),
      discountPercent: Number(userObj.discount || 0),
    };
  }

  return null;
};

/**
 * Resolve authoritative Total Course Fee & Discount Amount (INR) for a payment,
 * honoring saved price snapshots first and falling back to percentage / catalog price.
 */
export const resolvePaymentPricingForUser = ({
  user = null,
  courseObj = null,
  courseId = null,
  courseTitle = "",
  explicitTotalFee = null,
  explicitDiscountAmount = null,
}) => {
  const effectiveCourseId = courseId || courseObj?._id || null;
  const effectiveCourseTitle = courseTitle || courseObj?.title || "";
  const liveCatalogPrice = courseObj ? resolveCourseBasePrice(courseObj) : null;

  const snapshot = findMatchingCoursePricingSnapshot(
    user,
    effectiveCourseId,
    effectiveCourseTitle
  );

  const hasExplicitTotalFee =
    explicitTotalFee !== undefined &&
    explicitTotalFee !== null &&
    explicitTotalFee !== "" &&
    !Number.isNaN(Number(explicitTotalFee));

  const numericTotalFee = hasExplicitTotalFee
    ? Math.max(0, Number(explicitTotalFee))
    : snapshot
      ? Math.max(0, Number(snapshot.originalCoursePrice))
      : liveCatalogPrice;

  const hasExplicitDiscount =
    explicitDiscountAmount !== undefined &&
    explicitDiscountAmount !== null &&
    explicitDiscountAmount !== "" &&
    !Number.isNaN(Number(explicitDiscountAmount));

  let numericDiscount = 0;
  let pricingSource = "none";

  if (hasExplicitDiscount) {
    numericDiscount = Math.max(0, Number(explicitDiscountAmount));
    pricingSource = "explicit";
  } else if (
    snapshot &&
    numericTotalFee !== null &&
    Math.abs(Number(numericTotalFee) - Number(snapshot.originalCoursePrice)) < 0.01
  ) {
    numericDiscount = Math.max(
      0,
      Number((snapshot.originalCoursePrice - snapshot.offeredPrice).toFixed(2))
    );
    pricingSource = "snapshot";
  } else {
    const userDiscountPct = Math.min(100, Math.max(0, Number(user?.discount || 0)));
    numericDiscount =
      numericTotalFee > 0 && userDiscountPct > 0
        ? Number(((numericTotalFee * userDiscountPct) / 100).toFixed(2))
        : 0;
    pricingSource = userDiscountPct > 0 ? "percent" : "none";
  }

  return {
    totalCourseFee: numericTotalFee,
    discountAmount: numericDiscount,
    offeredPrice:
      numericTotalFee !== null
        ? Number(Math.max(0, numericTotalFee - numericDiscount).toFixed(2))
        : null,
    snapshot,
    pricingSource,
    liveCatalogPrice,
  };
};
