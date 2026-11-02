import User from "../model/User.js";
import Referral from "../model/Referral.js";

// Helper to generate a clean, readable referral code
const generateReferralCode = (name = "STUDENT") => {
  const cleanName = name
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 4)
    .toUpperCase();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `INX-${cleanName || "STUD"}${randomSuffix}`;
};

// GET My Referrals & Stats
export const getMyReferrals = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;
    const email = req.query.email;

    let user = null;
    if (userId) {
      user = await User.findById(userId);
    } else if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student account not found",
      });
    }

    // Auto-generate referral code if not already assigned
    if (!user.referralCode) {
      let code = generateReferralCode(user.fullname);
      let exists = await User.findOne({ referralCode: code });
      while (exists) {
        code = generateReferralCode(user.fullname);
        exists = await User.findOne({ referralCode: code });
      }
      user.referralCode = code;
      await user.save({ validateBeforeSave: false });
    }

    // Fetch existing referrals for this user
    let referrals = await Referral.find({ referrer: user._id })
      .sort({ createdAt: -1 })
      .lean();

    // If student has 0 referrals yet, provide sample initial state with empty referrals
    // Calculate analytics
    const totalInvited = referrals.length;
    let successfulReferralsCount = 0;
    let totalEarnings = 0;
    let pendingRewards = 0;
    let paidRewards = 0;

    referrals.forEach((r) => {
      if (
        r.status === "enrolled" ||
        r.status === "verified" ||
        r.status === "rewarded"
      ) {
        successfulReferralsCount += 1;
      }

      if (r.rewardStatus === "paid") {
        totalEarnings += r.rewardAmount || 0;
        paidRewards += r.rewardAmount || 0;
      } else if (r.rewardStatus === "approved") {
        totalEarnings += r.rewardAmount || 0;
      } else {
        pendingRewards += r.rewardAmount || 0;
      }
    });

    // Determine Ambassador Tier
    let tier = "Bronze";
    let rewardPerReferral = 1000;
    let friendDiscount = 15;
    let nextTierGoal = 4;

    if (successfulReferralsCount >= 10) {
      tier = "Platinum Ambassador";
      rewardPerReferral = 2000;
      friendDiscount = 25;
      nextTierGoal = 25;
    } else if (successfulReferralsCount >= 4) {
      tier = "Silver Ambassador";
      rewardPerReferral = 1500;
      friendDiscount = 20;
      nextTierGoal = 10;
    }

    const websiteBaseUrl =
      process.env.NEXT_PUBLIC_WEBSITE_URL ||
      process.env.CLIENT_URL ||
      "https://www.inxyme.com";

    const referralLink = `${websiteBaseUrl}/courses?ref=${user.referralCode}`;

    res.status(200).json({
      success: true,
      referralCode: user.referralCode,
      referralLink,
      upiId: user.upiId || "",
      stats: {
        totalInvited,
        successfulReferralsCount,
        totalEarnings,
        pendingRewards,
        paidRewards,
        rewardPerReferral,
        friendDiscount,
        tier,
        nextTierGoal,
      },
      referrals,
    });
  } catch (error) {
    console.error("Error fetching referrals:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching referral details",
      error: error.message,
    });
  }
};

// POST Payout Request
export const requestPayout = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { upiId, payoutMethod = "UPI", notes } = req.body;

    if (!upiId) {
      return res.status(400).json({
        success: false,
        message: "UPI ID or Payment details are required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.upiId = upiId;
    await user.save({ validateBeforeSave: false });

    // Mark eligible approved referrals as payout requested
    await Referral.updateMany(
      {
        referrer: user._id,
        rewardStatus: "approved",
        payoutRequested: false,
      },
      {
        $set: {
          payoutRequested: true,
          payoutMethod,
          payoutDetails: upiId,
          notes: notes || "Requested by student via student portal",
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "Payout request submitted successfully. Processing takes 24-48 hours.",
      upiId,
    });
  } catch (error) {
    console.error("Error processing payout request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit payout request",
      error: error.message,
    });
  }
};

// POST Invite Friend
export const createInvite = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { refereeName, refereeEmail, refereePhone, courseName } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const newReferral = await Referral.create({
      referrer: user._id,
      referrerCode: user.referralCode || generateReferralCode(user.fullname),
      refereeName: refereeName || "Invited Friend",
      refereeEmail: refereeEmail ? refereeEmail.toLowerCase() : undefined,
      refereePhone: refereePhone || undefined,
      courseName: courseName || "Inxyme Certification Program",
      status: "signed_up",
      rewardAmount: 1000,
      rewardStatus: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Invitation sent & registered successfully!",
      referral: newReferral,
    });
  } catch (error) {
    console.error("Error creating invite:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create referral invite",
      error: error.message,
    });
  }
};

// GET Validate Referral Code (Public)
export const validateReferralCode = async (req, res) => {
  try {
    const { code } = req.params;
    if (!code) {
      return res.status(400).json({ success: false, message: "Code required" });
    }

    const referrer = await User.findOne({
      referralCode: code.toUpperCase().trim(),
    }).select("fullname");

    if (!referrer) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: "Invalid referral code",
      });
    }

    res.status(200).json({
      success: true,
      valid: true,
      referrerName: referrer.fullname,
      discountPercentage: 15,
      message: "Referral code applied: 15% discount unlocked!",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

