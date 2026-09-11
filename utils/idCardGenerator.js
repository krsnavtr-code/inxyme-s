import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import Candidate from "../model/Candidate.js";
import pdf from "html-pdf";

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// PDF generation options
const pdfOptions = {
  height: "165mm",
  width: "125mm",
  border: {
    top: "0",
    right: "0",
    bottom: "0",
    left: "0",
  },
  type: "pdf",
  timeout: 30000,
  childProcessOptions: {
    env: {
      OPENSSL_CONF: "/dev/null",
    },
  },
};

// Generate a unique registration ID
const generateUniqueRegistrationId = async (userType) => {
  const prefix = userType === "student" ? "FVS" : "FVC";
  let registrationId;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Generate a new ID
    registrationId = `${prefix}${Date.now().toString().slice(-4)}`;

    // Check if this ID already exists in the database
    const existingCandidate = await Candidate.findOne({ registrationId });

    if (!existingCandidate) {
      isUnique = true;
    }

    attempts++;

    // Add a small delay to ensure we get a new timestamp
    if (!isUnique && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  if (!isUnique) {
    // Fallback to a random number if we couldn't generate a unique ID
    registrationId = `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
  }

  return registrationId;
};

// Function to generate ID card as a PDF
const generateIdCard = async (candidate, eventDetails = {}) => {
  const {
    name,
    email,
    phone,
    college,
    course,
    userType = "student", // Default to 'student' for backward compatibility
    companyName = "", // Default to empty string
  } = candidate;

  const { eventName = "JobFair 2025" } = eventDetails;

  // Generate a unique ID number
  const registrationId = await generateUniqueRegistrationId(userType);

  // Only try to save to database if this is not a test candidate
  if (
    candidate._id &&
    typeof candidate._id === "string" &&
    !candidate._id.startsWith("test")
  ) {
    try {
      // Save the registrationId to the candidate document
      await Candidate.findByIdAndUpdate(
        candidate._id,
        { registrationId },
        { new: true, runValidators: true },
      );
    } catch (error) {
      console.error("Error saving registrationId:", error);
      throw new Error("Failed to generate registration ID");
    }
  }

  // Create HTML content for the ID card
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Inxyme - Event ID Card</title>
        <style>
            .center-page {
                width: 100%;
                height: 100vh;
                display: table;
            }
            .center-content {
                display: table-cell;
                vertical-align: middle;
                text-align: center;
            }
            .id-photo img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }           
        </style>
    </head>
    <body style="font-size: 18px; font-weight: 500; letter-spacing: 0.5px; line-height: 1.5; font-family: 'Poppins', Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px;">
        <div style="width: 300px; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); color: black; background: #f5f7ff;">            
            <div style="padding: 10px; text-align: center; background: linear-gradient(135deg, rgb(244, 124, 38) 0%, rgb(244, 124, 38) 100%); color: white; border-bottom: 1px solid rgba(255, 255, 255, 0.2);">
                <h1 style="font-size: 15px; font-weight: 700; letter-spacing: 1px; margin: 0;">Inxyme</h1>
                <h2 style="font-size: 13px; font-weight: 700; letter-spacing: 1px; margin: 5px 0 0;">${eventName}</h2>
                <p style="font-size: 10px; font-weight: 600; letter-spacing: 1px; margin: 5px 0 0;">Official Participant ID Card</p>
            </div>
            
            <div style="display: flex; justify-content: center; padding: 10px 0;">
                <div style="width: 100px; height: 100px; margin: 10px auto; background: rgba(255, 255, 255, 0.9); border: 3px solid white; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                    ${
                      candidate.profilePhoto
                        ? `<img src="data:${candidate.profilePhoto.mimeType || "image/jpeg"};base64,${candidate.profilePhoto.base64}" 
                              alt="Profile Photo" 
                              style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">`
                        : `<div style="text-align: center; color: #4f46e5; font-size: 12px; display: flex; flex-direction: column; justify-content: center; height: 100%;">
                            <div style="font-size: 40px; margin-bottom: 5px; line-height: 1;">👤</div>
                            <div>No Photo</div>
                        </div>`
                    }
                </div>
            </div>
            
            <div style="padding: 0 15px 15px; font-family: 'Poppins', Arial, -serif; font-size: 12px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="font-weight: 600; width: 100px; padding: 4px 0; vertical-align: top;">ID:</td>
                  <td style="padding: 4px 0;">${registrationId}</td>
                </tr>
                <tr>
                  <td style="font-weight: 600; width: 100px; padding: 4px 0; vertical-align: top;">Name:</td>
                  <td style="padding: 4px 0;">${name}</td>
                </tr>
                <tr>
                  <td style="font-weight: 600; width: 100px; padding: 4px 0; vertical-align: top;">Email:</td>
                  <td style="padding: 4px 0;">${email}</td>
                </tr>
                <tr>
                  <td style="font-weight: 600; width: 100px; padding: 4px 0; vertical-align: top;">Phone:</td>
                  <td style="padding: 4px 0;">${phone || "N/A"}</td>
                </tr>
                ${
                  userType === "student"
                    ? `
                        <tr>
                          <td style="font-weight: 600; width: 120px; padding: 4px 0; vertical-align: top;">Institution:</td>
                          <td style="padding: 4px 0;">${college || "N/A"}</td>
                        </tr>
                        <tr> 
                          <td style="font-weight: 600; width: 120px; padding: 4px 0; vertical-align: top;">Course:</td>
                          <td style="padding: 4px 0;">${course || "N/A"}</td>
                        </tr>
                      `
                    : `
                        <tr>
                          <td style="font-weight: 600; width: 120px; padding: 4px 0; vertical-align: top;">Organisation:</td>
                          <td style="padding: 4px 0;">${companyName || "N/A"}</td>
                        </tr>
                      `
                }
                  
              </table>
            </div>
        </div>
    </body>
    </html>
    `;

  // Generate PDF from HTML
  return new Promise((resolve, reject) => {
    pdf.create(htmlContent, pdfOptions).toBuffer((err, buffer) => {
      if (err) {
        console.error("Error generating PDF:", err);
        return reject(new Error("Failed to generate PDF"));
      }
      resolve({
        buffer: buffer,
        filename: `ID_Card_${registrationId}.pdf`,
      });
    });
  });
};

export default generateIdCard;
