import { API_BASE_URL } from "./request.js";

/**
 * Đăng ký Stream Server-Sent Events (SSE) thời gian thực từ /api/realtime/stream
 */
function subscribeRealtimeStream({ onMessage, onError, onOpen } = {}) {
  if (typeof EventSource === "undefined") {
    throw new Error("EventSource is not available in this environment");
  }

  const url = `${API_BASE_URL}/api/realtime/stream`;
  const eventSource = new EventSource(url);

  eventSource.onopen = (event) => {
    onOpen?.(event);
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage?.(data);
    } catch (error) {
      console.error("SSE parse error:", error);
    }
  };

  eventSource.onerror = (error) => {
    onError?.(error);
  };

  return () => {
    eventSource.close();
  };
}

/**
 * Hàm tương thích ngược cho subscribeApi
 */
function subscribeApi(collection, method, handlers = {}) {
  return subscribeRealtimeStream(handlers);
}

function connectSocket(url, onData) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("WebSocket connected:", url);
      resolve(ws);
    };

    ws.onmessage = (event) => {
      try {
        const result = JSON.parse(event.data);

        console.log("Realtime:", result);

        // Cho phép component tự xử lý dữ liệu
        onData?.(result);
        ws.onData?.(result);
      } catch (error) {
        console.error("Invalid WebSocket data:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      reject(error);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected:", url);
    };
  });
}

export {
  subscribeRealtimeStream,
  subscribeApi,
  connectSocket
};
