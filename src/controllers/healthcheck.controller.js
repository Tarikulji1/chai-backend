import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"


const healthcheck = asyncHandler(async (req, res) => {
    //TODO: build a healthcheck response that simply returns the OK status as json with a message

    // A healthcheck typically just confirms the server is reachable and operational.
    // It returns a 200 OK status with a simple message.
    return res
        .status(200)
        .json(new ApiResponse(
            200,
            {}, // No specific data needed for a healthcheck
            "API server is healthy and running!"
        ));
})

export { healthcheck };