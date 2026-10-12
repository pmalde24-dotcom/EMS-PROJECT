'use strict';
const mongoose = require('mongoose');

const companySettingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'company', unique: true }, // ensures one settings doc
    name: { type: String, default: 'Acme Technologies Pvt. Ltd.', trim: true },
    legalName: String,
    logo: { url: String, publicId: String },
    website: String,
    email: { type: String, default: 'hr@acme.com' },
    phone: { type: String, default: '+91 79 4000 0000' },
    address: { line1: String, line2: String, city: { type: String, default: 'Ahmedabad' }, state: { type: String, default: 'Gujarat' }, country: { type: String, default: 'India' }, pincode: String },
    taxId: String, // GST / company registration
    timezone: { type: String, default: 'Asia/Kolkata' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    timeFormat: { type: String, enum: ['12h', '24h'], default: '12h' },
    currency: { type: String, default: 'INR' },
    currencySymbol: { type: String, default: '₹' },
    financialYearStart: { type: String, default: '04-01' }, // MM-DD
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5] }, // 0=Sunday
    workingHours: { start: { type: String, default: '09:30' }, end: { type: String, default: '18:30' } },
    employeeIdPattern: { type: String, default: 'EMP{YYYY}{SEQ:4}' },
    attendancePolicy: {
      gracePeriodMinutes: { type: Number, default: 15 },
      halfDayThresholdHours: { type: Number, default: 4 },
      fullDayHours: { type: Number, default: 8 },
      overtimeAfterHours: { type: Number, default: 9 },
      maxOvertimeHoursPerDay: { type: Number, default: 4 },
      allowWorkFromHome: { type: Boolean, default: true },
      requireLocation: { type: Boolean, default: false },
      allowMultiplePunches: { type: Boolean, default: false },
      autoMarkAbsent: { type: Boolean, default: true },
      correctionWindowDays: { type: Number, default: 7 },
    },
    leavePolicy: {
      carryForwardEnabled: { type: Boolean, default: true },
      maxCarryForwardDays: { type: Number, default: 10 },
      encashmentEnabled: { type: Boolean, default: false },
      allowHalfDay: { type: Boolean, default: true },
      requireDocumentAfterDays: { type: Number, default: 3 },
      minNoticeDays: { type: Number, default: 1 },
      maxConsecutiveDays: { type: Number, default: 30 },
    },
    payrollSettings: {
      payDay: { type: Number, default: 1 },
      workingDaysPerMonth: { type: Number, default: 22 },
      overtimeRateMultiplier: { type: Number, default: 1.5 },
      pfEnabled: { type: Boolean, default: true },
      pfEmployeePercent: { type: Number, default: 12 },
      pfEmployerPercent: { type: Number, default: 12 },
      esiEnabled: { type: Boolean, default: true },
      esiEmployeePercent: { type: Number, default: 0.75 },
      esiEmployerPercent: { type: Number, default: 3.25 },
      esiWageLimit: { type: Number, default: 21000 },
      professionalTaxEnabled: { type: Boolean, default: true },
      professionalTaxSlabs: {
        type: [{ upTo: Number, amount: Number }],
        default: [
          { upTo: 12000, amount: 0 },
          { upTo: 20000, amount: 150 },
          { upTo: null, amount: 200 },
        ],
      },
      taxRegime: { type: String, default: 'new' },
      taxSlabs: {
        type: [{ upTo: Number, rate: Number }],
        default: [
          { upTo: 400000, rate: 0 },
          { upTo: 800000, rate: 5 },
          { upTo: 1200000, rate: 10 },
          { upTo: 1600000, rate: 15 },
          { upTo: 2000000, rate: 20 },
          { upTo: 2400000, rate: 25 },
          { upTo: null, rate: 30 },
        ],
      },
      standardDeduction: { type: Number, default: 75000 },
      payrollApprovalLevels: { type: Number, default: 1 },
      lockAfterProcessing: { type: Boolean, default: true },
    },
    notificationSettings: {
      emailEnabled: { type: Boolean, default: true },
      birthdayReminders: { type: Boolean, default: true },
      anniversaryReminders: { type: Boolean, default: true },
      documentExpiryReminders: { type: Boolean, default: true },
      attendanceReminders: { type: Boolean, default: true },
      dailyDigestAt: { type: String, default: '09:00' },
    },
    dataRetention: { auditLogDays: { type: Number, default: 730 }, inactiveEmployeeArchivalDays: { type: Number, default: 3650 } },
    onboardingTemplates: [{
      name: String, department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
      tasks: [{ title: String, category: { type: String, enum: ['documentation', 'it_setup', 'training', 'hr_formalities', 'introduction', 'other'], default: 'other' }, ownerRole: String, dueAfterDays: Number }],
    }],
    documentTemplates: {
      offerLetter: String, appointmentLetter: String, relievingLetter: String, experienceLetter: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CompanySettings', companySettingsSchema);
