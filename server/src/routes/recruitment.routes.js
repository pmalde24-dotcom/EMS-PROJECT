'use strict';
const express = require('express');
const { z } = require('zod');
const { JobOpening, JobApplication, Employee, Department, Designation, CompanySettings } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { sendCSV } = require('../utils/csv');
const { fileUploader, persistFile } = require('../utils/upload');
const { notify } = require('../utils/notify');
const { nextCode } = require('../utils/sequence');
const { streamPDF, header } = require('../utils/pdf');

const router = express.Router();
const STAGES = ['applied', 'screening', 'shortlisted', 'interview_scheduled', 'selected', 'offer_sent', 'hired', 'rejected', 'withdrawn'];

/* ── JOB OPENINGS ─────────────────────────────────────────────────── */
const jobSchema = z.object({
  title: z.string().min(2), department: z.string().min(1), designation: z.string().optional(),
  description: z.string().min(10), responsibilities: z.array(z.string()).optional(),
  requiredSkills: z.array(z.string()).optional(), preferredSkills: z.array(z.string()).optional(),
  experienceMin: z.coerce.number().min(0).optional(), experienceMax: z.coerce.number().min(0).optional(),
  qualifications: z.array(z.string()).optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern', 'consultant']).optional(),
  workMode: z.enum(['onsite', 'remote', 'hybrid']).optional(), location: z.string().optional(),
  openings: z.coerce.number().min(1).optional(),
  salaryRange: z.object({ min: z.coerce.number().optional(), max: z.coerce.number().optional(), currency: z.string().optional(), hideFromCandidate: z.boolean().optional() }).optional(),
  applicationDeadline: z.coerce.date().optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['draft', 'open', 'on_hold', 'closed', 'cancelled']).optional(),
  hiringManager: z.string().optional().nullable(),
  interviewRounds: z.array(z.object({ name: z.string(), order: z.coerce.number().optional(), type: z.string().optional() })).optional(),
}).passthrough();

router.get('/jobs', requirePermission('recruitment:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['title', 'jobCode', 'description', 'requiredSkills', 'location'], filterFields: ['status', 'department', 'employmentType', 'priority', 'workMode'], defaultSort: '-createdAt' });
  opts.filter.deletedAt = null;
  const { items, meta } = await paginate(JobOpening, opts, { populate: [{ path: 'department', select: 'name code' }, { path: 'designation', select: 'title' }, { path: 'hiringManager', select: 'firstName lastName' }] });
  const counts = await JobApplication.aggregate([{ $match: { jobOpening: { $in: items.map((i) => i._id) }, deletedAt: null } }, { $group: { _id: { job: '$jobOpening', stage: '$stage' }, count: { $sum: 1 } } }]);
  const enriched = items.map((j) => {
    const rows = counts.filter((c) => String(c._id.job) === String(j._id));
    return { ...j, applicationStats: rows.reduce((a, r) => ({ ...a, [r._id.stage]: r.count, total: (a.total || 0) + r.count }), { total: 0 }) };
  });
  return respond.list(res, enriched, meta);
}));

router.get('/jobs/:id', requirePermission('recruitment:view'), asyncHandler(async (req, res) => {
  const job = await JobOpening.findById(req.params.id).populate('department', 'name code').populate('designation', 'title').populate('hiringManager', 'firstName lastName employeeId').lean();
  if (!job) throw ApiError.notFound('Job opening not found');
  const byStage = await JobApplication.aggregate([
    { $match: { jobOpening: job._id, deletedAt: null } },
    { $group: { _id: '$stage', count: { $sum: 1 } } },
  ]);
  const stages = byStage.reduce((a, r) => ({ ...a, [r._id]: r.count }), {});
  return respond.ok(res, {
    job,
    applicationStats: { ...stages, total: byStage.reduce((n, r) => n + r.count, 0) },
  });
}));

router.post('/jobs', requirePermission('recruitment:create'), validate({ body: jobSchema }), asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.body.department);
  if (!dept) throw ApiError.badRequest('Department not found');
  const jobCode = await nextCode('JOB{YY}{SEQ:4}', { prefix: 'JOB', seqKey: 'jobOpening' });
  const job = await JobOpening.create({ ...req.body, jobCode, createdBy: req.user._id, publishedAt: new Date(), hiringManager: req.body.hiringManager || null });
  await recordAudit(req, { action: 'recruitment.job_create', module: 'recruitment', targetModel: 'JobOpening', targetId: job._id, description: `Created job opening ${job.title} (${jobCode})` });
  return respond.created(res, job, 'Job opening created');
}));

router.patch('/jobs/:id', requirePermission('recruitment:update'), asyncHandler(async (req, res) => {
  const job = await JobOpening.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job opening not found');
  Object.assign(job, req.body);
  if (req.body.status === 'closed') { job.closedAt = new Date(); job.closeReason = req.body.closeReason; }
  await job.save();
  return respond.ok(res, job, 'Job opening updated');
}));

router.delete('/jobs/:id', requirePermission('recruitment:delete'), asyncHandler(async (req, res) => {
  const job = await JobOpening.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), status: 'closed' }, { new: true });
  if (!job) throw ApiError.notFound('Job opening not found');
  await recordAudit(req, { action: 'recruitment.job_delete', module: 'recruitment', targetId: job._id, description: `Closed/deleted job ${job.title}`, severity: 'warning' });
  return respond.ok(res, { _id: job._id }, 'Job opening closed');
}));

/* ── APPLICATIONS ─────────────────────────────────────────────────── */
router.get('/applications', requirePermission('recruitment:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['applicationNo', 'candidate.firstName', 'candidate.lastName', 'candidate.email', 'skills'], filterFields: ['stage', 'jobOpening', 'source', 'rating', 'assignedTo'], defaultSort: '-appliedAt' });
  opts.filter.deletedAt = null;
  const { items, meta } = await paginate(JobApplication, opts, { populate: [{ path: 'jobOpening', select: 'title jobCode department' }, { path: 'assignedTo', select: 'name' }] });
  if (req.query.export === 'csv') {
    return sendCSV(res, `applications-${Date.now()}.csv`, items, [
      { key: 'applicationNo', label: 'Application' }, { key: 'jobOpening.title', label: 'Position' },
      { key: 'candidate.firstName', label: 'First Name' }, { key: 'candidate.lastName', label: 'Last Name' },
      { key: 'candidate.email', label: 'Email' }, { key: 'candidate.phone', label: 'Phone' },
      { key: 'candidate.totalExperience', label: 'Experience (yrs)' }, { key: 'stage', label: 'Stage' },
      { key: 'source', label: 'Source' },
    ]);
  }
  return respond.list(res, items, meta);
}));

/** Pipeline board grouped by stage. */
router.get('/pipeline', requirePermission('recruitment:view'), asyncHandler(async (req, res) => {
  const filter = { deletedAt: null };
  if (req.query.jobOpening) filter.jobOpening = req.query.jobOpening;
  const apps = await JobApplication.find(filter).populate('jobOpening', 'title jobCode').sort('-appliedAt').limit(500).lean();
  const board = STAGES.map((s) => ({ stage: s, count: apps.filter((a) => a.stage === s).length, applications: apps.filter((a) => a.stage === s) }));
  const [bySource, conversion] = await Promise.all([
    JobApplication.aggregate([{ $match: filter }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    JobApplication.aggregate([{ $match: filter }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
  ]);
  return respond.ok(res, { board, bySource, funnel: conversion, total: apps.length });
}));

router.get('/applications/:id', requirePermission('recruitment:view'), asyncHandler(async (req, res) => {
  const app = await JobApplication.findById(req.params.id)
    .populate('jobOpening').populate('interviews.interviewers', 'firstName lastName employeeId')
    .populate('interviews.feedback.interviewer', 'firstName lastName').populate('referredBy', 'firstName lastName employeeId')
    .populate('assignedTo', 'name').lean();
  if (!app) throw ApiError.notFound('Application not found');
  return respond.ok(res, app);
}));

/** Public-ish apply endpoint (used by careers page): no auth required. */
router.post('/applications/public/:jobCode', fileUploader({ types: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], maxSizeMB: 5, field: 'resume' }),
  asyncHandler(async (req, res) => {
    const job = await JobOpening.findOne({ jobCode: String(req.params.jobCode).toUpperCase(), status: 'open', deletedAt: null });
    if (!job) throw ApiError.notFound('This job opening is not available');
    const body = req.body || {};
    if (!body.firstName || !body.lastName || !body.email) throw ApiError.badRequest('firstName, lastName and email are required');
    const dup = await JobApplication.findOne({ jobOpening: job._id, 'candidate.email': String(body.email).toLowerCase(), deletedAt: null });
    if (dup) throw ApiError.conflict('You have already applied for this position');
    const resume = req.file ? await persistFile(req.file) : undefined;
    const applicationNo = await nextCode('APP{YYYY}{SEQ:5}', { prefix: 'APP', seqKey: 'application' });
    const application = await JobApplication.create({
      applicationNo, jobOpening: job._id,
      candidate: { ...body, email: String(body.email).toLowerCase(), totalExperience: parseFloat(body.totalExperience) || 0 },
      resume, coverLetter: body.coverLetter, source: body.source || 'careers_page',
      skills: body.skills ? String(body.skills).split(',').map((s) => s.trim()) : [],
      stage: 'applied', stageHistory: [{ stage: 'applied', note: 'Application received' }],
    });
    return respond.created(res, { applicationNo: application.applicationNo, stage: application.stage }, 'Application submitted successfully');
  })
);

/* ── CREATE APPLICATION MANUALLY (HR) ─────────────────────────────── */
router.post('/applications', requirePermission('recruitment:create'), fileUploader({ types: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'], maxSizeMB: 5, field: 'resume' }),
  asyncHandler(async (req, res) => {
    const { jobOpening, firstName, lastName, email } = req.body;
    if (!jobOpening || !firstName || !lastName || !email) throw ApiError.badRequest('jobOpening, firstName, lastName and email are required');
    const job = await JobOpening.findById(jobOpening);
    if (!job) throw ApiError.badRequest('Job opening not found');
    const resume = req.file ? await persistFile(req.file) : undefined;
    const applicationNo = await nextCode('APP{YYYY}{SEQ:5}', { prefix: 'APP', seqKey: 'application' });
    const application = await JobApplication.create({
      applicationNo, jobOpening: job._id,
      candidate: { firstName, lastName, email: String(email).toLowerCase(), phone: req.body.phone, currentCompany: req.body.currentCompany, currentDesignation: req.body.currentDesignation, totalExperience: parseFloat(req.body.totalExperience) || 0, expectedCtc: parseFloat(req.body.expectedCtc) || undefined, noticePeriodDays: parseInt(req.body.noticePeriodDays, 10) || undefined, currentLocation: req.body.currentLocation },
      resume, source: req.body.source || 'referral', skills: req.body.skills ? String(req.body.skills).split(',').map((s) => s.trim()) : [],
      stage: 'applied', stageHistory: [{ stage: 'applied', by: req.user._id, note: 'Added by recruiter' }],
    });
    return respond.created(res, application, 'Application created');
  })
);

/** Move an application through the pipeline. */
router.post('/applications/:id/stage', requirePermission('recruitment:update', 'recruitment:approve'), validate({ body: z.object({
  stage: z.enum(STAGES), note: z.string().optional(), rejectionReason: z.string().optional(), screening: z.object({ score: z.coerce.number().optional(), notes: z.string().optional(), qualified: z.boolean().optional() }).optional(),
}) }), asyncHandler(async (req, res) => {
  const app = await JobApplication.findById(req.params.id).populate('jobOpening');
  if (!app) throw ApiError.notFound('Application not found');
  if (app.stage === req.body.stage) throw ApiError.badRequest(`Application is already in "${req.body.stage}" stage`);
  app.stage = req.body.stage;
  app.stageHistory.push({ stage: req.body.stage, by: req.user._id, note: req.body.note });
  if (req.body.screening) app.screening = { ...(app.screening || {}), ...req.body.screening, screenedBy: req.user._id, screenedAt: new Date() };
  if (req.body.stage === 'rejected') { app.rejectionReason = req.body.rejectionReason || 'Not selected'; app.rejectionStage = app.stage; }
  if (req.body.stage === 'hired') {
    app.jobOpening.vacanciesFilled = (app.jobOpening.vacanciesFilled || 0) + 1;
    if (app.jobOpening.vacanciesFilled >= app.jobOpening.openings) { app.jobOpening.status = 'closed'; app.jobOpening.closedAt = new Date(); app.jobOpening.closeReason = 'All positions filled'; }
    await app.jobOpening.save();
  }
  await app.save();
  await recordAudit(req, { action: 'recruitment.stage_change', module: 'recruitment', targetId: app._id, description: `Application ${app.applicationNo} moved to "${req.body.stage}"` });
  return respond.ok(res, app, `Application moved to ${req.body.stage.replace(/_/g, ' ')}`);
}));

/* ── INTERVIEWS ───────────────────────────────────────────────────── */
router.post('/applications/:id/interviews', requirePermission('recruitment:update'), validate({ body: z.object({
  name: z.string().optional(), type: z.enum(['screening', 'technical', 'managerial', 'hr', 'assignment', 'culture_fit']).optional(),
  scheduledAt: z.coerce.date(), durationMinutes: z.coerce.number().optional(),
  mode: z.enum(['in_person', 'video', 'phone']).optional(), meetingLink: z.string().optional(), venue: z.string().optional(),
  interviewers: z.array(z.string()).optional(),
}) }), asyncHandler(async (req, res) => {
  const app = await JobApplication.findById(req.params.id);
  if (!app) throw ApiError.notFound('Application not found');
  const interview = { ...req.body, round: app.interviews.length + 1, status: 'scheduled' };
  app.interviews.push(interview);
  if (['applied', 'screening', 'shortlisted'].includes(app.stage)) {
    app.stage = 'interview_scheduled';
    app.stageHistory.push({ stage: 'interview_scheduled', by: req.user._id, note: `Interview scheduled for ${new Date(req.body.scheduledAt).toISOString()}` });
  }
  await app.save();
  const interviewers = await Employee.find({ _id: { $in: req.body.interviewers || [] } }).select('user firstName').lean();
  await Promise.all(interviewers.filter((i) => i.user).map((i) => notify({
    userId: i.user, title: 'Interview scheduled', body: `You are an interviewer for ${app.candidate.firstName} ${app.candidate.lastName} on ${new Date(req.body.scheduledAt).toLocaleString('en-IN')}.`, type: 'recruitment', link: `/recruitment/applications/${app._id}`, sendEmail: true,
  })));
  await recordAudit(req, { action: 'recruitment.interview_schedule', module: 'recruitment', targetId: app._id, description: `Interview round ${interview.round} scheduled for ${app.candidate.email}` });
  return respond.created(res, app.interviews[app.interviews.length - 1], 'Interview scheduled');
}));

router.post('/applications/:id/interviews/:interviewId/feedback', requirePermission('recruitment:update', 'recruitment:approve'), validate({ body: z.object({
  ratings: z.object({ technical: z.coerce.number().optional(), communication: z.coerce.number().optional(), problemSolving: z.coerce.number().optional(), cultureFit: z.coerce.number().optional() }).optional(),
  overallRating: z.coerce.number().min(1).max(5), strengths: z.string().optional(), concerns: z.string().optional(),
  recommendation: z.enum(['strong_hire', 'hire', 'hold', 'no_hire']), comments: z.string().optional(), result: z.enum(['pass', 'fail', 'on_hold']).optional(),
}) }), asyncHandler(async (req, res) => {
  const app = await JobApplication.findById(req.params.id);
  if (!app) throw ApiError.notFound('Application not found');
  const interview = app.interviews.id(req.params.interviewId);
  if (!interview) throw ApiError.notFound('Interview not found');
  interview.feedback.push({ ...req.body, interviewer: req.scope.selfEmployeeId, submittedAt: new Date() });
  interview.status = 'completed';
  if (req.body.result) {
    interview.result = req.body.result;
    if (req.body.result === 'pass') { app.stage = 'selected'; app.stageHistory.push({ stage: 'selected', by: req.user._id, note: 'Cleared interview rounds' }); }
    else if (req.body.result === 'fail') { app.rejectionReason = 'Did not clear interviews'; interview.status = 'completed'; }
  }
  const ratings = interview.feedback.map((f) => f.overallRating).filter(Boolean);
  if (ratings.length) app.rating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
  await app.save();
  await recordAudit(req, { action: 'recruitment.interview_feedback', module: 'recruitment', targetId: app._id, description: `Interview feedback submitted for ${app.applicationNo} (${req.body.recommendation})` });
  return respond.ok(res, interview, 'Feedback submitted');
}));

/* ── OFFER LETTER ─────────────────────────────────────────────────── */
router.post('/applications/:id/offer', requirePermission('recruitment:approve', 'recruitment:update'), validate({ body: z.object({
  ctc: z.coerce.number().min(0), joiningDate: z.coerce.date(), designation: z.string().optional(), expiryDate: z.coerce.date().optional(), notes: z.string().optional(), sendEmail: z.boolean().optional(),
}) }), asyncHandler(async (req, res) => {
  const app = await JobApplication.findById(req.params.id).populate('jobOpening');
  if (!app) throw ApiError.notFound('Application not found');
  app.offer = { status: 'sent', ctc: req.body.ctc, joiningDate: req.body.joiningDate, sentAt: new Date(), expiryDate: req.body.expiryDate, notes: req.body.notes, designation: req.body.designation };
  if (['applied', 'screening', 'shortlisted', 'interview_scheduled', 'selected'].includes(app.stage)) {
    app.stage = 'offer_sent';
    app.stageHistory.push({ stage: 'offer_sent', by: req.user._id, note: `Offer sent (CTC ${req.body.ctc})` });
  }
  await app.save();
  if (req.body.sendEmail !== false) {
    const { sendMail, layout } = require('../utils/mailer');
    await sendMail({
      to: app.candidate.email, subject: `Offer of employment — ${app.jobOpening?.title}`,
      html: layout('Offer of Employment', `<p>Dear ${app.candidate.firstName} ${app.candidate.lastName},</p><p>We are pleased to offer you the position of <b>${app.jobOpening?.title}</b> with an annual CTC of <b>₹${req.body.ctc.toLocaleString('en-IN')}</b>.</p><p>Proposed joining date: <b>${new Date(req.body.joiningDate).toDateString()}</b>${req.body.expiryDate ? `<br/>Please respond by ${new Date(req.body.expiryDate).toDateString()}.` : ''}</p><p>Congratulations and welcome aboard!</p>`),
    });
  }
  await recordAudit(req, { action: 'recruitment.offer_sent', module: 'recruitment', targetId: app._id, description: `Offer sent to ${app.candidate.email} (CTC ${req.body.ctc})`, severity: 'critical' });
  return respond.ok(res, app, 'Offer sent');
}));

router.get('/applications/:id/offer/pdf', requirePermission('recruitment:view'), asyncHandler(async (req, res) => {
  const app = await JobApplication.findById(req.params.id).populate('jobOpening');
  if (!app) throw ApiError.notFound('Application not found');
  const settings = await CompanySettings.findOne({ singleton: 'company' }) || {};
  streamPDF(res, `offer-${app.applicationNo}.pdf`, (doc) => {
    header(doc, { company: settings.name || 'Company', subtitle: `${settings.address?.line1 || ''}, ${settings.address?.city || ''}`, title: 'Offer of Employment' });
    doc.fontSize(10).fillColor('#111827');
    doc.text(`Date: ${new Date().toDateString()}`);
    doc.moveDown(0.6);
    doc.text(`Dear ${app.candidate.firstName} ${app.candidate.lastName},`);
    doc.moveDown(0.5);
    doc.text(`With reference to your application and subsequent interviews, we are pleased to offer you the position of ${app.jobOpening?.title || 'Team Member'} at ${settings.name || 'our company'}.`, { align: 'justify' });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Key terms:');
    doc.font('Helvetica');
    doc.text(`• Annual CTC: INR ${(app.offer?.ctc || 0).toLocaleString('en-IN')}`);
    doc.text(`• Proposed joining date: ${app.offer?.joiningDate ? new Date(app.offer.joiningDate).toDateString() : 'To be confirmed'}`);
    doc.text(`• Work location: ${app.jobOpening?.location || 'Ahmedabad'}`);
    doc.text(`• Employment type: ${String(app.jobOpening?.employmentType || 'full_time').replace('_', ' ')}`);
    if (app.offer?.expiryDate) doc.text(`• Offer valid until: ${new Date(app.offer.expiryDate).toDateString()}`);
    doc.moveDown(0.7);
    doc.text('This offer is subject to successful verification of your documents and background checks. Please sign and return a copy of this letter to confirm your acceptance.', { align: 'justify' });
    doc.moveDown(1.5);
    doc.text('Sincerely,');
    doc.moveDown(0.8).font('Helvetica-Bold').text('Human Resources');
    doc.font('Helvetica').text(settings.name || 'Company');
  }, { title: 'Offer Letter' });
}));

router.post('/applications/:id/offer/respond', validate({ body: z.object({ response: z.enum(['accepted', 'declined']), reason: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const app = await JobApplication.findById(req.params.id);
  if (!app) throw ApiError.notFound('Application not found');
  if (app.offer?.status !== 'sent') throw ApiError.badRequest('No pending offer for this application');
  app.offer.status = req.body.response === 'accepted' ? 'accepted' : 'declined';
  app.offer.respondedAt = new Date();
  if (req.body.response === 'declined') { app.stage = 'withdrawn'; app.rejectionReason = req.body.reason || 'Offer declined'; }
  app.stageHistory.push({ stage: app.stage, note: `Offer ${app.offer.status}` });
  await app.save();
  return respond.ok(res, app, `Offer ${app.offer.status}`);
}));

/* ── CONVERT CANDIDATE → EMPLOYEE ─────────────────────────────────── */
router.post('/applications/:id/convert', requirePermission('employees:create', 'recruitment:update'), validate({ body: z.object({
  department: z.string().optional(), designation: z.string(), joiningDate: z.coerce.date(),
  basic: z.coerce.number().min(0), hra: z.coerce.number().min(0).optional(), ctcAnnual: z.coerce.number().min(0),
  reportingManager: z.string().optional().nullable(), workLocation: z.string().optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern', 'consultant']).optional(),
  createLogin: z.boolean().optional(),
}) }), asyncHandler(async (req, res) => {
  const app = await JobApplication.findById(req.params.id).populate('jobOpening');
  if (!app) throw ApiError.notFound('Application not found');
  if (app.convertedEmployee) throw ApiError.conflict('This candidate has already been converted to an employee');
  const settings = await CompanySettings.findOne({ singleton: 'company' });
  const departmentId = req.body.department || app.jobOpening?.department;
  const dept = await Department.findById(departmentId);
  const desig = await Designation.findById(req.body.designation);
  if (!dept || !desig) throw ApiError.badRequest('Department and designation are required');
  const existing = await Employee.findOne({ email: app.candidate.email.toLowerCase(), deletedAt: null });
  if (existing) throw ApiError.conflict('An employee with this email already exists');

  const { nextCode } = require('../utils/sequence');
  const { SalaryStructure } = require('../models');
  const { User } = require('../models');
  const employeeId = await nextCode(settings?.employeeIdPattern || 'EMP{YYYY}{SEQ:4}', { prefix: 'EMP' });
  const employee = await Employee.create({
    employeeId, firstName: app.candidate.firstName, lastName: app.candidate.lastName,
    email: app.candidate.email.toLowerCase(), phone: app.candidate.phone, dateOfBirth: app.candidate.dateOfBirth,
    joiningDate: req.body.joiningDate, department: dept._id, designation: desig._id,
    employmentType: req.body.employmentType || app.jobOpening?.employmentType || 'full_time',
    employmentStatus: 'probation', employeeCategory: 'probationer',
    reportingManager: req.body.reportingManager || null, workLocation: req.body.workLocation || app.jobOpening?.location || 'Ahmedabad HQ',
    skills: (app.skills || []).map((s) => ({ name: s })),
    qualifications: app.qualifications || [], experience: (app.experience || []).map((e) => ({ ...e, current: false })),
    createBy: req.user._id, createdBy: req.user._id,
    history: [{ by: req.user._id, action: 'created_from_recruitment', note: `Converted from application ${app.applicationNo}` }],
  });
  await SalaryStructure.create({ employee: employee._id, effectiveFrom: req.body.joiningDate, ctcAnnual: req.body.ctcAnnual, basic: req.body.basic, hra: req.body.hra || Math.round(req.body.basic * 0.4), specialAllowance: Math.max(0, Math.round(req.body.ctcAnnual / 12) - req.body.basic - (req.body.hra || Math.round(req.body.basic * 0.4))), revision: 'initial', createdBy: req.user._id });
  if (req.body.createLogin !== false) {
    const user = await User.create({ name: `${employee.firstName} ${employee.lastName}`, email: employee.email, password: `Welcome@${Math.floor(1000 + Math.random() * 9000)}`, role: 'employee', employee: employee._id });
    employee.user = user._id;
    await employee.save();
  }
  app.stage = 'hired';
  app.convertedEmployee = employee._id;
  app.stageHistory.push({ stage: 'hired', by: req.user._id, note: `Converted to employee ${employee.employeeId}` });
  await app.save();
  await recordAudit(req, { action: 'recruitment.convert', module: 'recruitment', targetId: app._id, description: `Candidate ${app.candidate.email} converted to employee ${employee.employeeId}`, severity: 'critical' });
  return respond.created(res, { employee, application: app }, 'Candidate converted to employee');
}));

/* ── RECRUITMENT REPORTS ──────────────────────────────────────────── */
router.get('/reports/summary', requirePermission('recruitment:view', 'reports:view'), asyncHandler(async (req, res) => {
  const [byStage, byDepartment, bySource, timeToHire, monthly] = await Promise.all([
    JobApplication.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
    JobOpening.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$department', open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } }, openings: { $sum: '$openings' }, filled: { $sum: '$vacanciesFilled' } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } }, { $project: { department: '$d.name', open: 1, openings: 1, filled: 1, _id: 0 } }]),
    JobApplication.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$source', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    JobApplication.aggregate([{ $match: { stage: 'hired', deletedAt: null } }, { $project: { days: { $divide: [{ $subtract: ['$updatedAt', '$appliedAt'] }, 86400000] } } }, { $group: { _id: null, avgDays: { $avg: '$days' } } }]),
    JobApplication.aggregate([{ $match: { deletedAt: null, appliedAt: { $gte: new Date(new Date().getFullYear(), 0, 1) } } }, { $group: { _id: { m: { $month: '$appliedAt' } }, applications: { $sum: 1 }, hires: { $sum: { $cond: [{ $eq: ['$stage', 'hired'] }, 1, 0] } } } }, { $sort: { '_id.m': 1 } }]),
  ]);
  return respond.ok(res, { byStage, byDepartment, bySource, avgTimeToHireDays: Math.round((timeToHire[0]?.avgDays || 0) * 10) / 10, monthly });
}));

module.exports = router;
