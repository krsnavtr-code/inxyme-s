import User from "../model/User.js";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
export const signup = async(req, res) => {
    try {
        const { fullname, email, password, department } = req.body;
        
        // Validate required fields for student role
        if (!department) {
            return res.status(400).json({
                success: false,
                message: 'Department is required for student registration'
            });
        }
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false,
                message: "User already exists" 
            });
        }

        // Create new user - the pre-save hook will hash the password
        const newUser = new User({
            fullname,
            email,
            password: password, // The pre-save hook will hash this
            role: 'student', // Default role
            department
        });

        await newUser.save();

        // Generate JWT token
        const token = jwt.sign(
            { userId: newUser._id, email: newUser.email, role: newUser.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        // Set cookie with token
        res.cookie('jwt', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });

        // Return success response with user data and token
        res.status(201).json({
            success: true,
            token: token,
            user: {
                _id: newUser._id,
                fullname: newUser.fullname,
                email: newUser.email,
                role: newUser.role
            },
            message: "User registered successfully"
        });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get current authenticated user
export const getCurrentUser = async (req, res) => {
    try {
        // The user is attached to the request by the auth middleware
        const user = await User.findById(req.user.userId).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user profile',
            error: error.message
        });
    }
};

// Update user profile
export const updateProfile = async (req, res) => {
    try {
        const { phone, address } = req.body;
        const userId = req.user.id; // Get user ID from the authenticated request

        // Validate input
        if (!phone && !address) {
            return res.status(400).json({
                success: false,
                message: 'At least one field (phone or address) is required for update'
            });
        }

        // Find the user and update only the provided fields
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { 
                $set: { 
                    ...(phone && { phone }),
                    ...(address && { address })
                } 
            },
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile',
            error: error.message
        });
    }
};

export const login = async(req, res) => {
    try {
        const { email, password } = req.body;
        
        // Input validation
        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                message: 'Please provide both email and password' 
            });
        }

        // Find user by email and include password field
        const user = await User.findOne({ email }).select('+password');
        
        if (!user) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid email or password' 
            });
        }

        // Check password using bcrypt
        const isMatch = await bcryptjs.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid email or password' 
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user._id, 
                email: user.email, 
                role: user.role || 'student' // Changed default role to match our schema
            },
            process.env.JWT_SECRET || 'your_jwt_secret', // Fallback secret for development
            { 
                expiresIn: process.env.JWT_EXPIRES_IN || '1d' 
            }
        );

        // Set cookie with token
        res.cookie('jwt', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });

        // Prepare user data for response (exclude password)
        const userData = {
            _id: user._id,
            fullname: user.fullname,
            email: user.email,
            role: user.role || 'student',
            department: user.department,
            isActive: user.isActive !== false,
            isApproved: Boolean(user.isApproved)
        };

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token: token,
            user: userData
        });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};