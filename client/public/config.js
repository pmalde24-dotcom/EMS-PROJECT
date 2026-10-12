// ── EMS runtime config (deploy વખતે આ ફાઇલ બદલો, rebuild ની જરૂર નહીં) ──
//
// Render પર frontend અને backend અલગ-અલગ સર્વિસ હોય તો નીચે backend નું URL મૂકો:
//   window.__EMS_API_URL__ = 'https://ems-api.onrender.com';
//
// એક જ સર્વિસમાં frontend + backend (ભલામણ કરેલી રીત) હોય તો ખાલી રાખો —
// આપોઆપ same-origin '/api' વપરાય છે.
window.__EMS_API_URL__ = window.__EMS_API_URL__ || '';
