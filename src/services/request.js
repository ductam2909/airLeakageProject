import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

async function request(url, { method = "GET", params, data, headers } = {}) {
  const response = await client({
    url,
    method,
    params,
    data,
    headers,
  });

  return response.data;
}

function getRequest(url, params, options = {}) {
  return request(url, { ...options, method: "GET", params });
}

function postRequest(url, data, options = {}) {
  return request(url, { ...options, method: "POST", data });
}

function putRequest(url, data, options = {}) {
  return request(url, { ...options, method: "PUT", data });
}

function patchRequest(url, data, options = {}) {
  return request(url, { ...options, method: "PATCH", data });
}

function DeleteRequest(url, data, options = {}) {
  return request(url, { ...options, method: "DELETE", data });
}

export {
  API_BASE_URL,
  request,
  getRequest,
  postRequest,
  putRequest,
  patchRequest,
  DeleteRequest,
};
