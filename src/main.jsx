import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";

import dayjs from "dayjs";
import "dayjs/locale/vi";
dayjs.locale("vi");

createRoot(document.getElementById("root")).render(
  <ConfigProvider locale={viVN}>
    <App />
  </ConfigProvider>,
);
