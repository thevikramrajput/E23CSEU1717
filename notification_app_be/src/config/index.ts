import dotenv from "dotenv";
import { AuthCredentials } from "logging-middleware";

dotenv.config();

export const authCredentials: AuthCredentials = {
  email: process.env.AUTH_EMAIL || "",
  name: process.env.AUTH_NAME || "",
  rollNo: process.env.AUTH_ROLL_NO || "",
  accessCode: process.env.AUTH_ACCESS_CODE || "",
  clientID: process.env.AUTH_CLIENT_ID || "",
  clientSecret: process.env.AUTH_CLIENT_SECRET || "",
};

export const apiBase = "http://4.224.186.213/evaluation-service";
