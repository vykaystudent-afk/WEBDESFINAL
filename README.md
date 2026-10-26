# Barangay Covered Court Reservation System

## 📌 Overview
The **Barangay Covered Court Reservation System** is a web-based application designed to streamline the process of booking the local barangay covered court. It provides a user-friendly interface for residents to view the court's schedule, request reservations, and check the status of their bookings, while allowing the barangay desk to easily manage, approve, or decline requests.

**Live Demo:** [https://finalsgroup3.netlify.app/](https://finalsgroup3.netlify.app/)

## ✨ Features
* **Interactive Court Schedule:** Users can view the daily schedule to see which slots are available. The schedule uses visual indicators for different statuses:
  * 🟢 **Approved:** The slot is confirmed and booked.
  * 🟡 **Pending:** A request has been made and the slot is temporarily held.
  * 🔵 **Your Request:** Highlights the specific slots requested by the current user.
* **Easy Reservation:** Users can tap on an available hour on the schedule to initiate a booking request.
* **Request Management:** Users can check the status of their existing requests or cancel them if needed. 
* **Barangay Desk Management:** Allows administrators/staff to review incoming requests. Declined and cancelled requests automatically free up the time slot.

## 🕒 Court Guidelines & Rules
* **Operating Hours:** 6:00 AM to 10:00 PM.
* **Approval Process:** Requests are held on the schedule as "Pending" until the barangay desk makes a decision. 
* **Payment:** Fees are configured by the barangay. Users must pay the required fee directly at the barangay hall after their request has been approved.

## ⚙️ Configuration & Setup
For developers or administrators managing the system:
* **Fee Configuration:** Sample rates and fees are set in the `CONFIG` block at the top of the main page script. These can be adjusted by the developer or barangay staff to reflect the real court usage rates.

## 🚀 How to Use
**For Residents:**
1. Open the website and view the **Court Schedule**.
2. Tap on your desired available time slot to start a reservation request.
3. Fill out any necessary details to submit your request.
4. Use the **"Check or cancel a request"** section to monitor your booking status.
5. Once approved, proceed to the barangay hall to settle the payment.

---
*Created by Finals Group 3*
