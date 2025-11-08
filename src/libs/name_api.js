const version = 'v1';
const nameApi = process.env.NODE_ENV === 'development' ? `/api_jarvis_dev/${version}` : `/api_jarvis/${version}`;
export default nameApi;