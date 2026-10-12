'use strict';
const respond = {
  ok: (res, data = null, message = 'OK', status = 200) => res.status(status).json({ success: true, message, data }),
  created: (res, data, message = 'Created successfully') => res.status(201).json({ success: true, message, data }),
  list: (res, items, meta, message = 'OK') => res.json({ success: true, message, data: items, meta }),
  noContent: (res) => res.status(204).send(),
};
module.exports = respond;
