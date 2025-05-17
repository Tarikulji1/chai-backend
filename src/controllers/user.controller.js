import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";


const registerUser = asyncHandler( async (req, res) => {
    // get user details from frontend
    // validation - not empty
    // check if user already exists : username or email
    // check for images or avatar
    // upload them to cloudinary, avatar 
    // create user object - create entry in db
    // remove password and refresh token fields from the response
    // check for user creation 
    // return response


    const { fullName, email, username, password } = req.body
    console.log("email", email);

    // Method: 2
    if (
        [fullName, email, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError("Please fill all the fields", 400);
    }

    /* Method: 1
    if (fullName === "" || email === "" || username === "" || password === "") {
       throw new ApiError("Please fill all the fields", 400);
    }
    */

    const existedUser = User.findOne({
        $or: [{ username }, { email }]
    })
    if (existedUser) {
        throw new ApiError("User already exists", 409);
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    const covarImageLocalPath = req.files?.coverImage[0]?.path;

    if (!avatarLocalPath) {
        throw new ApiError("Please upload an avatar", 400);        
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(covarImageLocalPath);

    if (!avatar) {
        throw new ApiError("Avatar upload failed", 500);
    }

    const user = await User.create({
        fullName,
        email,
        username: username.toLowerCase(),
        password,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
    });

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken -__v -createdAt -updatedAt"
    )
    if (!createdUser) {
        throw new ApiError("User creation failed", 500);
    }
    
    return res.status(201).json(
        new ApiResponse(201, createdUser, "User registered successfully")
    );

});

export { registerUser };