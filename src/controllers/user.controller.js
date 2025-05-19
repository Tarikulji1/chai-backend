import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { use } from "react";


const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accesToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        // save refresh token in db
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accesToken, refreshToken };



    } catch (error) {
        throw new ApiError(500, "Error generating access and refresh tokens");
        
    }
    
}

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
    // console.log("email", email);
    // console.log(req.body);

    // Method: 2
    if (
        [fullName, email, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "Please fill all the fields");
    }

    /* Method: 1
    if (fullName === "" || email === "" || username === "" || password === "") {
       throw new ApiError("Please fill all the fields", 400);
    }
    */

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists");
    }
    // console.log(req.files);

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const covarImageLocalPath = req.files?.coverImage[0]?.path;

    let covarImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        covarImageLocalPath = req.files.coverImage[0].path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Please upload an avatar");        
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(covarImageLocalPath);

    if (!avatar) {
        throw new ApiError(500, "Avatar file is required");
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage.url || "",
        email,
        password,
        username: username.toLowerCase()
    });

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser) {
        throw new ApiError(500, "User creation failed");
    }
    
    return res.status(201).json(
        new ApiResponse(201, createdUser, "User registered successfully")
    );

}});

const loginUser = asyncHandler(async (req, res) => {
    // req.body -> data
    // username or email - can access
    //  find the user
    // check for password
    // access and refresh token
    // send cookies

    const { email, username, password } = req.body;

    // Method: 1
    if (!username && !email) {
        throw new ApiError(400, "Please provide username or email");
    }

    /* Method: 2
    if (!(username || email)) {
        throw new ApiError(400, "Please provide username or email");
    }
    */
    
    const user = await User.findOne({ $or: [{ username }, { email }] });
    
    if (!user) {
        throw new ApiError(401, "User does not exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials");
    }

    const { accesToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly: true,
        secure: true,
    }

    return res
        .status(200)
        .cookie("accessToken", accesToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200, 
                {
                    user: loggedInUser, accesToken, refreshToken
                },
                "User logged in successfully")
        );
});


const logoutUser = asyncHandler(async (req, res) => {
    // remove refresh token from db
    // remove cookies
    // send response

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true,
        }
    );

    const options = {
        httpOnly: true,
        secure: true,
    }

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(200, {}, "User logged out successfully")
        );

});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET,
        )
    
        const user = await User.findById(decodedToken._id);
    
        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }
    
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token does not match or expired");
        }
    
        const options = {
            httpOnly: true,
            secure: true,
        }
    
        const { accesToken, newrefreshToken } = await generateAccessAndRefreshTokens(user._id);
    
        return res
            .status(200)
            .cookie("accessToken", accesToken, options)
            .cookie("refreshToken", newrefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {accesToken, refreshToken: newrefreshToken},
                    "Access token refreshed successfully"
                )
            );
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});

export { 
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken
};