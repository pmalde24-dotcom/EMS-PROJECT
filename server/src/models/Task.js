'use strict';
const mongoose = require('mongoose');
const { ENUMS } = require('../config/constants');

const subtaskSchema = new mongoose.Schema(
  { title: { type: String, required: true }, completed: { type: Boolean, default: false }, completedAt: Date, assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, order: Number },
  { _id: true }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
    parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true }],
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    status: { type: String, enum: ENUMS.taskStatus, default: 'todo', index: true },
    priority: { type: String, enum: ENUMS.priority, default: 'medium', index: true },
    startDate: Date,
    dueDate: { type: Date, index: true },
    completedAt: Date,
    estimatedHours: { type: Number, default: 0 },
    loggedHours: { type: Number, default: 0 },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    billable: { type: Boolean, default: true },
    tags: [String],
    attachments: [{ fileName: String, url: String, fileType: String, size: Number, uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, uploadedAt: Date }],
    subtasks: { type: [subtaskSchema], default: [] },
    commentsCount: { type: Number, default: 0 },
    dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    isRecurring: { type: Boolean, default: false },
    recurrence: { frequency: { type: String, enum: ['daily', 'weekly', 'monthly', null], default: null }, nextRunAt: Date },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    blockedReason: String,
    order: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
    activity: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, note: String }],
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ assignees: 1, status: 1, dueDate: 1 });
taskSchema.index({ title: 'text', description: 'text', tags: 'text' });

taskSchema.virtual('isOverdue').get(function () {
  return !!(this.dueDate && !this.completedAt && ['completed', 'cancelled'].indexOf(this.status) === -1 && new Date(this.dueDate) < new Date());
});

const TaskComment = mongoose.model('TaskComment', new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    body: { type: String, required: true, maxlength: 3000 },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
    attachments: [{ fileName: String, url: String, fileType: String }],
    editedAt: Date,
  },
  { timestamps: true }
));

module.exports = mongoose.model('Task', taskSchema);
module.exports.TaskComment = TaskComment;
