
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const catchAsync = require('../utils/catchAsync');
const { ConflictError, NotFoundError, ForbiddenError } = require('../utils/customErrors');
const { default: mongoose } = require('mongoose');
const ADMIN_USER_ID = '6891b3d809ca3b6c16837f4d';

// get users list
exports.getAllUsers = catchAsync(async (req, res, next) => {
    const users = await User.find().select('-password -refreshToken -__v -updatedAt').populate({
        path: 'role',
        select: 'role_name _id' 
    });;
    res.status(200).json({
        status: 'success',
        results: users.length,
        data: users,
    });
});

// create user
exports.createUser = catchAsync(async (req, res, next) => {
    const { name, email, password ,mobile,role} = req.body; 
    const userExists = await User.findOne({ email });
    if (userExists) throw new ConflictError("User already exists")
    const hash = await bcrypt.hash(password, 10);
    const createdUser = await User.create({ ...req.body,name, email, password: hash,mobile, role });
    // Now re-fetch user to populate and exclude password
    const user = await User.findById(createdUser._id)
        .select('-password -__v -updatedAt')
        .populate({ path: "role", select: '-__v' });
    res.status(201).json({ status: 'success', message: 'User registered successfully',data:user });
});

// get user by id
exports.getUserById = catchAsync(async (req, res, next) => {
     const isValidObjectId = mongoose.Types.ObjectId.isValid;
    if (!isValidObjectId(req.params.id))throw new NotFoundError('User not found');
    const user = await User.findById(req.params.id).select('-password -__v -updatedAt');
    if (!user) throw new NotFoundError('User not found');
    res.status(200).json({ status: 'success', data: user });
});

// update user
exports.updateUser = catchAsync(async (req, res, next) => {
    const isValidObjectId = mongoose.Types.ObjectId.isValid;
    if (!isValidObjectId(req.params.id))throw new NotFoundError('User not found');
    const { name, email, password,mobile, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) throw new NotFoundError('User not found');
    if (email && email !== user.email) {
        const emailTaken = await User.findOne({ email });
        if (emailTaken) throw new ConflictError('Email already in use');
        user.email = email;
    }
    if (name) user.name = name;
    if(mobile) user.mobile = mobile;
    if (role) user.role = role;
    if (password) user.password = await bcrypt.hash(password, 10);
    const updatedUser = await user.save();
    const result = await User.findById(updatedUser._id)
    .select('-password -__v -updatedAt')
    .populate({ path: "role", select: '-__v -updatedAt' });
    res.status(200).json({ status: 'success', message: 'User updated successfully', data: result });
});


exports.deleteUser = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const isValidObjectId = mongoose.Types.ObjectId.isValid;
    if (!isValidObjectId(req.params.id))throw new NotFoundError('User not found');
    if (id === ADMIN_USER_ID) throw new ForbiddenError("Cannot delete the admin user")
    const user = await User.findByIdAndDelete(id);
    if (!user) throw new NotFoundError('User not found');
    res.status(200).json({
        status: 'success',
        message: 'User deleted successfully',
        data:user
    });
});
