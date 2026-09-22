import Discussion from '../model/Discussion.js';
import User from '../model/User.js';

// @desc    Get all discussions
// @route   GET /api/discussions
// @access  Public
export const getDiscussions = async (req, res) => {
  try {
    const { category, search, sort, page = 1, limit = 10 } = req.query;
    const query = {};

    // Filter by category if provided
    if (category && category !== 'All') {
      query.category = category;
    }

    // Search in title, content, or tags
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Sorting
    let sortOption = { createdAt: -1 }; // Default: newest first
    if (sort === 'popular') {
      sortOption = { likes: -1 };
    } else if (sort === 'unanswered') {
      query['comments.0'] = { $exists: false }; // No comments
    }

    const discussions = await Discussion.find(query)
      .populate('user', 'name email avatar')
      .populate('comments.user', 'name email avatar')
      .sort(sortOption)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Discussion.countDocuments(query);

    res.json({
      success: true,
      count: discussions.length,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      data: discussions
    });
  } catch (error) {
    console.error('Error getting discussions:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get single discussion
// @route   GET /api/discussions/:id
// @access  Public
export const getDiscussion = async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id)
      .populate('user', 'name email avatar')
      .populate('comments.user', 'name email avatar');

    if (!discussion) {
      return res.status(404).json({ success: false, message: 'Discussion not found' });
    }

    // Increment view count
    discussion.views += 1;
    await discussion.save();

    res.json({ success: true, data: discussion });
  } catch (error) {
    console.error('Error getting discussion:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Create discussion
// @route   POST /api/discussions
// @access  Private
export const createDiscussion = async (req, res) => {
  try {
    const { title, content, category, tags } = req.body;

    const discussion = new Discussion({
      title,
      content,
      category,
      tags: tags || [],
      user: req.user.id
    });

    await discussion.save();
    await discussion.populate('user', 'name email avatar');

    res.status(201).json({ success: true, data: discussion });
  } catch (error) {
    console.error('Error creating discussion:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update discussion
// @route   PUT /api/discussions/:id
// @access  Private
export const updateDiscussion = async (req, res) => {
  try {
    const { title, content, category, tags } = req.body;

    let discussion = await Discussion.findById(req.params.id);

    if (!discussion) {
      return res.status(404).json({ success: false, message: 'Discussion not found' });
    }

    // Check if user is the owner or admin/employee
    const isAuthorizedUser =
      discussion.user.toString() === req.user.id ||
      req.user.role === 'admin' ||
      req.user.role === 'employee' ||
      Boolean(req.user.adminRoleId);

    if (!isAuthorizedUser) {
      return res.status(401).json({ success: false, message: 'Not authorized to update this discussion' });
    }

    discussion = await Discussion.findByIdAndUpdate(
      req.params.id,
      { title, content, category, tags: tags || [] },
      { new: true, runValidators: true }
    ).populate('user', 'name email avatar');

    res.json({ success: true, data: discussion });
  } catch (error) {
    console.error('Error updating discussion:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Delete discussion
// @route   DELETE /api/discussions/:id
// @access  Private
export const deleteDiscussion = async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id);

    if (!discussion) {
      return res.status(404).json({ success: false, message: 'Discussion not found' });
    }

    // Check if user is the owner or admin/employee
    const isAuthorizedToDelete =
      discussion.user.toString() === req.user.id ||
      req.user.role === 'admin' ||
      req.user.role === 'employee' ||
      Boolean(req.user.adminRoleId);

    if (!isAuthorizedToDelete) {
      return res.status(401).json({ success: false, message: 'Not authorized to delete this discussion' });
    }

    await discussion.remove();

    res.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting discussion:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Add comment to discussion
// @route   POST /api/discussions/:id/comments
// @access  Private
export const addComment = async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      console.error('No content provided in request');
      return res.status(400).json({ success: false, message: 'Comment content is required' });
    }

    const discussion = await Discussion.findById(req.params.id);

    if (!discussion) {
      console.error('Discussion not found:', req.params.id);
      return res.status(404).json({ success: false, message: 'Discussion not found' });
    }

    const comment = {
      user: req.user.id,
      content,
      likes: [],
      dislikes: []
    };

    discussion.comments.unshift(comment);
    
    try {
      // Save the discussion with the new comment
      const savedDiscussion = await discussion.save();
      // Get the newly added comment (it's the first one in the array)
      const newComment = savedDiscussion.comments[0];
      
      // Populate the user data using the Discussion model
      const populatedDiscussion = await Discussion.populate(savedDiscussion, {
        path: 'comments.user',
        select: 'name email avatar'
      });
      
      // Get the populated comment
      const populatedComment = populatedDiscussion.comments.id(newComment._id);
      
      res.status(201).json({ 
        success: true, 
        data: populatedComment.toObject()
      });
    } catch (saveError) {
      console.error('Error saving discussion:', saveError);
      if (saveError.name === 'ValidationError') {
        console.error('Validation errors:', saveError.errors);
      }
      throw saveError;
    }
  } catch (error) {
    console.error('Error in addComment:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      errors: error.errors
    });
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Toggle like/dislike on discussion or comment
// @route   PUT /api/discussions/:id/reaction
// @access  Private
export const toggleReaction = async (req, res) => {
  try {
    const { reaction, commentId } = req.body;
    const discussion = await Discussion.findById(req.params.id);

    if (!discussion) {
      return res.status(404).json({ success: false, message: 'Discussion not found' });
    }

    let target;
    const update = {};

    if (commentId) {
      // Handle comment reaction
      const comment = discussion.comments.id(commentId);
      if (!comment) {
        return res.status(404).json({ success: false, message: 'Comment not found' });
      }
      target = comment;
    } else {
      // Handle discussion reaction
      target = discussion;
    }

    const userId = req.user.id;
    const likeIndex = target.likes.indexOf(userId);
    const dislikeIndex = target.dislikes.indexOf(userId);

    if (reaction === 'like') {
      if (likeIndex === -1) {
        // Add like
        target.likes.push(userId);
        // Remove dislike if exists
        if (dislikeIndex !== -1) {
          target.dislikes.splice(dislikeIndex, 1);
        }
      } else {
        // Remove like
        target.likes.splice(likeIndex, 1);
      }
    } else if (reaction === 'dislike') {
      if (dislikeIndex === -1) {
        // Add dislike
        target.dislikes.push(userId);
        // Remove like if exists
        if (likeIndex !== -1) {
          target.likes.splice(likeIndex, 1);
        }
      } else {
        // Remove dislike
        target.dislikes.splice(dislikeIndex, 1);
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid reaction type' });
    }

    await discussion.save();

    res.json({
      success: true,
      data: {
        likes: target.likes,
        dislikes: target.dislikes,
        likesCount: target.likes.length,
        dislikesCount: target.dislikes.length,
        userReaction: target.likes.includes(userId) ? 'like' : target.dislikes.includes(userId) ? 'dislike' : null
      }
    });
  } catch (error) {
    console.error('Error toggling reaction:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Mark comment as solution
// @route   PUT /api/discussions/:id/solution/:commentId
// @access  Private
export const markAsSolution = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const discussion = await Discussion.findById(id);

    if (!discussion) {
      return res.status(404).json({ success: false, message: 'Discussion not found' });
    }

    // Check if user is the discussion owner
    if (discussion.user.toString() !== req.user.id) {
      return res.status(401).json({ success: false, message: 'Not authorized to mark as solution' });
    }

    const comment = discussion.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Toggle solution status
    if (discussion.solution && discussion.solution.toString() === commentId) {
      // Unmark as solution
      discussion.solution = null;
      comment.isSolution = false;
    } else {
      // Mark as solution
      // First, unmark any existing solution
      if (discussion.solution) {
        const existingSolution = discussion.comments.id(discussion.solution);
        if (existingSolution) {
          existingSolution.isSolution = false;
        }
      }
      discussion.solution = comment._id;
      comment.isSolution = true;
    }

    await discussion.save();

    res.json({ success: true, data: discussion });
  } catch (error) {
    console.error('Error marking as solution:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Toggle pin status of a discussion
// @route   PUT /api/discussions/:id/pin
// @access  Private/Admin
export const togglePinDiscussion = async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id);

    if (!discussion) {
      return res.status(404).json({ success: false, message: 'Discussion not found' });
    }

    // Check if user is admin/employee
    const isAuthorizedAdmin =
      req.user.role === 'admin' ||
      req.user.role === 'employee' ||
      Boolean(req.user.adminRoleId);

    if (!isAuthorizedAdmin) {
      return res.status(401).json({ success: false, message: 'Not authorized to pin discussions' });
    }

    discussion.isPinned = !discussion.isPinned;
    await discussion.save();

    res.json({ success: true, data: discussion });
  } catch (error) {
    console.error('Error toggling pin status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Toggle lock status of a discussion
// @route   PUT /api/discussions/:id/lock
// @access  Private/Admin
export const toggleLockDiscussion = async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id);

    if (!discussion) {
      return res.status(404).json({ success: false, message: 'Discussion not found' });
    }

    // Check if user is admin or moderator
    const canLock =
      req.user.role === 'admin' ||
      req.user.role === 'employee' ||
      req.user.role === 'moderator' ||
      Boolean(req.user.adminRoleId);

    if (!canLock) {
      return res.status(401).json({ success: false, message: 'Not authorized to lock discussions' });
    }

    discussion.isLocked = !discussion.isLocked;
    await discussion.save();

    res.json({ success: true, data: discussion });
  } catch (error) {
    console.error('Error toggling lock status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
