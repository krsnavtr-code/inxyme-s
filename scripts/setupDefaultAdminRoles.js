import mongoose from 'mongoose';
import AdminRole from '../model/AdminRole.js';
import User from '../model/User.js';
import dotenv from 'dotenv';

dotenv.config();

const defaultRoles = [
  {
    name: 'Super Admin',
    description: 'Full access to all admin features',
    permissions: [
      { page: 'dashboard', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'lms-management', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'test-qa', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'courses', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'send-brochure', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'send-proposal', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'candidates', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'categories', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'users', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'blog', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'contacts', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'payments', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'enrollments', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'faqs', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'image-gallery', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'admin-management', canView: true, canCreate: true, canEdit: true, canDelete: true }
    ]
  },
  {
    name: 'Content Manager',
    description: 'Manage content, blog, courses, and FAQs',
    permissions: [
      { page: 'dashboard', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'lms-management', canView: true, canCreate: true, canEdit: true, canDelete: false },
      { page: 'test-qa', canView: true, canCreate: true, canEdit: true, canDelete: false },
      { page: 'courses', canView: true, canCreate: true, canEdit: true, canDelete: false },
      { page: 'blog', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'faqs', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'image-gallery', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'categories', canView: true, canCreate: true, canEdit: true, canDelete: false }
    ]
  },
  {
    name: 'User Manager',
    description: 'Manage users, candidates, and enrollments',
    permissions: [
      { page: 'dashboard', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'users', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'candidates', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { page: 'enrollments', canView: true, canCreate: false, canEdit: true, canDelete: false },
      { page: 'contacts', canView: true, canCreate: false, canEdit: false, canDelete: false }
    ]
  },
  {
    name: 'Email Manager',
    description: 'Handle email communications and proposals',
    permissions: [
      { page: 'dashboard', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'send-brochure', canView: true, canCreate: true, canEdit: true, canDelete: false },
      { page: 'send-proposal', canView: true, canCreate: true, canEdit: true, canDelete: false },
      { page: 'contacts', canView: true, canCreate: false, canEdit: false, canDelete: false }
    ]
  },
  {
    name: 'Payment Manager',
    description: 'Manage payments and financial operations',
    permissions: [
      { page: 'dashboard', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'payments', canView: true, canCreate: false, canEdit: true, canDelete: false },
      { page: 'enrollments', canView: true, canCreate: false, canEdit: true, canDelete: false }
    ]
  },
  {
    name: 'Viewer',
    description: 'Read-only access to most sections',
    permissions: [
      { page: 'dashboard', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'lms-management', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'test-qa', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'courses', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'candidates', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'users', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'blog', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'contacts', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'payments', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'enrollments', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'faqs', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { page: 'image-gallery', canView: true, canCreate: false, canEdit: false, canDelete: false }
    ]
  }
];

const setupDefaultRoles = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    // Clear existing roles (optional - remove if you want to keep existing roles)
    // await AdminRole.deleteMany({});
    // console.log('Cleared existing admin roles');

    // Create default roles
    for (const roleData of defaultRoles) {
      const existingRole = await AdminRole.findOne({ name: roleData.name });

      if (!existingRole) {
        const role = await AdminRole.create(roleData);
        console.log(`Created role: ${role.name}`);
      } else {
        console.log(`Role already exists: ${roleData.name}`);
      }
    }

    console.log('Default admin roles setup completed!');

    // Display created roles
    const roles = await AdminRole.find().sort({ name: 1 });
    console.log('\nAvailable Admin Roles:');
    roles.forEach(role => {
      console.log(`- ${role.name}: ${role.description}`);
      console.log(`  Permissions: ${role.permissions.filter(p => p.canView).map(p => p.page).join(', ')}`);
    });

  } catch (error) {
    console.error('Error setting up default roles:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
};

// Run the setup
setupDefaultRoles();
