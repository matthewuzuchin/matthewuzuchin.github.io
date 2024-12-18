// express is the framework we're going to use to handle requests
import express, { Request, Response, Router, NextFunction } from 'express';

import jwt from 'jsonwebtoken';

const key = {
    secret: process.env.JSON_WEB_TOKEN,
};

import {
    pool,
    validationFunctions,
    credentialingFunctions,
} from '../../core/utilities';

export interface Auth {
    email: string;
    password: string;
}

const isStringProvided = validationFunctions.isStringProvided;
const generateHash = credentialingFunctions.generateHash;
const generateSalt = credentialingFunctions.generateSalt;

const forgotPasswordRouter: Router = express.Router();

export interface IUserRequest extends Request {
    id: number;
}

const isValidNewPassword = (newPassword: string): boolean =>
    newPassword.length >= 8 &&
    newPassword.length <= 24 &&
    /[!@#$%^&*()_+=-]/.test(newPassword) &&
    /\d/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /[A-Z]/.test(newPassword);

const isValidPhone = (phone: string): boolean =>
    /^\d{3}-\d{3}-\d{4}$/.test(phone);

const isValidEmail = (email: string): boolean => email.includes('@');

/**
 * @api {put} /forgotPassword Request for Forgot Password
 *
 * @apiDescription Request to change old password
 *
 * <ul> <b>Password:</b>
 *      <li> Must be between 8 to 24 characters long</li>
 *      <li> Must include both uppercase and lowercase letters </li>
 *      <li> Must contain at least one numeric digit and special character </li>
 * </ul>
 *
 *
 * @apiName PutForgotPassword
 * @apiGroup Forgot Password
 *
 * @apiBody {String} username a username *unique
 * @apiBody {String} email a users email *unique
 * @apiBody {String} phone a users phonenumber *unique
 * @apiBody {String} newPassword a users new password
 * @apiBody {String} confirmNewPassword confirmation of new password
 *
 * @apiSuccess (200: OK) {string} message "Password updated successfully"
 * @apiSuccess (200: OK) {string} resetToken a newly created JWT
 *
 * @apiError (400: Missing Parameters) {String} message "Missing a parameter"
 * @apiError (400: Password Mismatch) {String} message "The passwords do not match"
 * @apiError (400: Invalid Email) {String} message "Invalid email - please refer to registration documentation"
 * @apiError (400: Invalid PhoneNumber) {String} message "Invalid phone number - please refer to registration documentation"
 * @apiError (400: Invalid NewPassword) {String} message "Invalid new password - please refer to documentation"
 * @apiError (404: User does not exist) {String} message "User does not exist within the Database"
 *
 * @apiError (500: DB Query Error) {String} message "Unexpected issue on account retrieval in the database"
 * @apiError (500: Server Error) {String} message "Unexpected issue on retrieving user in the database"
 * @apiError (500: Password Update Error) {String} message "Unexpected issue on updating password in the database"
 */
forgotPasswordRouter.put(
    '/forgotPassword',
    (request: Request, response: Response, next: NextFunction) => {
        //Verify that the caller supplied all the parameters
        //In js, empty strings or null values evaulte to false
        if (
            // username, email, new password must be provided
            isStringProvided(request.body.username) &&
            isStringProvided(request.body.email) &&
            isStringProvided(request.body.newPassword) &&
            isStringProvided(request.body.confirmNewPassword) &&
            isStringProvided(request.body.phone)
        ) {
            next();
        } else {
            response.status(400).send({
                message: 'Missing a parameter',
            });
        }
    },
    (request: Request, response: Response, next: NextFunction) => {
        if (isValidNewPassword(request.body.newPassword)) {
            if (request.body.newPassword == request.body.confirmNewPassword) {
                next();
                return;
            } else {
                response.status(400).send({
                    message: 'The passwords do not match',
                });
            }
            return;
        } else {
            response.status(400).send({
                message: 'Invalid new password - please refer to documentation',
            });
            return;
        }
    },
    (request: Request, response: Response, next: NextFunction) => {
        if (isValidEmail(request.body.email)) next();
        else {
            response.status(400).send({
                message:
                    'Invalid email - please refer to registration documentation',
            });
            return;
        }
    },
    (request: Request, response: Response, next: NextFunction) => {
        if (isValidPhone(request.body.phone)) next();
        else {
            response.status(400).send({
                message:
                    'Invalid phone number - please refer to registration documentation',
            });
            return;
        }
    },
    // Check if User exists within the database
    (request: IUserRequest, response: Response, next: NextFunction) => {
        const theQuery = `
            SELECT account_id FROM Account 
            WHERE username = $1 AND email = $2 AND phone = $3
        `;
        const values = [
            request.body.username,
            request.body.email,
            request.body.phone,
        ];
        console.dir({ ...request.body, password: '******' });
        pool.query(theQuery, values)
            .then((result) => {
                if (result.rows.length == 0) {
                    response.status(404).send({
                        message: 'User does not exist within the Database',
                    });
                } else {
                    request.id = result.rows[0].account_id;
                    next();
                }
            })
            .catch((error) => {
                console.error('DB Query Error');
                console.error(error);
                response.status(500).send({
                    message:
                        'Unexpected issue on account retrieval in the database',
                });
            });
    },
    (request: IUserRequest, response: Response) => {
        if (!request.id) {
            response.status(500).send({
                message: 'Unexpected issue on retrieving user in the database',
            });
            return;
        }

        const salt = generateSalt(32);
        const saltedHash = generateHash(request.body.newPassword, salt);

        const updateQuery = `
            UPDATE Account_Credential SET salted_hash = $1, salt = $2 WHERE account_id = $3
        `;
        const values = [saltedHash, salt, request.id];

        pool.query(updateQuery, values)
            .then(() => {
                const resetToken = jwt.sign(
                    { id: request.id },
                    key.secret,
                    { expiresIn: '15m' } // Token expires in 15 minutes
                );

                response.status(200).send({
                    message: 'Password updated successfully',
                    resetToken, // Optionally send this to confirm success
                });
            })
            .catch((error) => {
                console.error('Password Update Error');
                console.error(error);
                response.status(500).send({
                    message:
                        'Unexpected issue on updating password in the database',
                });
            });
    }
);
export { forgotPasswordRouter };
