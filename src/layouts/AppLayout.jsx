import { useState, useEffect, useCallback } from "react";
import { Tabs } from "antd";
import {
  ArrowLeftOutlined,
  AppstoreOutlined,
  HistoryOutlined,
  SettingOutlined,
  PoweroffOutlined,
} from "@ant-design/icons";

import DashboardPage from "../pages/DashboardPage";
import HistoryPage from "../pages/HistoryPage";
import SettingModal from "../components/common/SettingModal.jsx";
import PowerConfirmModal from "../components/common/PowerConfirmModal.jsx";
import { SettingsContext } from "../contexts/SettingsContext.js";
import { getRequest, putRequest } from "../services/request";

function mapPressureThreshold(settings = {}) {
  return {
    min: Number(settings.pressure_min ?? 100),
    max: Number(settings.pressure_max ?? 500),
    leakMax: Number(settings.leak_max ?? 25),
  };
}

function AppLayout() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [historyResetKey, setHistoryResetKey] = useState(0);
  const [openModal, setOpenModal] = useState(false);
  const [openPowerModal, setOpenPowerModal] = useState(false);
  const [threshold, setThreshold] = useState({
    min: 100,
    max: 500,
    leakMax: 25,
  });

  // Load ngưỡng áp suất từ Flask backend khi khởi động
  useEffect(() => {
    let isMounted = true;

    async function loadSettingsData() {
      try {
        const settings = await getRequest("/api/settings");
        if (!isMounted || !settings) return;
        setThreshold(mapPressureThreshold(settings));
      } catch (error) {
        console.error("Lỗi tải cài đặt:", error);
      }
    }

    loadSettingsData();

    return () => {
      isMounted = false;
    };
  }, []);

  const items = [
    {
      key: "dashboard",
      label: (
        <span className="tab-label">
          <AppstoreOutlined />
          Bảng điều khiển
        </span>
      ),
    },
    {
      key: "history",
      label: (
        <span className="tab-label">
          <HistoryOutlined />
          Lịch sử hoạt động
        </span>
      ),
    },
  ];

  const handleOpenSetting = () => {
    setOpenModal(true);
  };

  const handleCloseSetting = () => {
    setOpenModal(false);
  };

  const handleSaveSetting = async (values) => {
    const min = Number(values.minPressure);
    const max = Number(values.maxPressure);
    const leakMax = Number(values.leakMax ?? threshold.leakMax);

    // Lưu vào Flask backend
    const updatedSettings = await putRequest("/api/settings", {
      pressure_min: min,
      pressure_max: max,
      leak_max: leakMax,
    });

    setThreshold(mapPressureThreshold(updatedSettings));
    setOpenModal(false);
  };

  const handleCloseApp = () => {
    if (window.electronAPI?.closeApp) {
      window.electronAPI.closeApp();
      return;
    }
    window.close();
  };

  const handleViewHistoryDetail = (historyDetail) => {
    setSelectedHistory(historyDetail);
    setActiveTab("dashboard");
  };

  const handleBackToHistory = () => {
    setSelectedHistory(null);
    setActiveTab("history");
  };

  const handleMeasurementStart = useCallback(() => {
    setSelectedHistory(null);
    setActiveTab("dashboard");
  }, []);

  const handleTabChange = (key) => {
    if (key === "dashboard") {
      setSelectedHistory(null);
      setHistoryResetKey((current) => current + 1);
    }

    if (key === "history") {
      setSelectedHistory(null);
    }

    setActiveTab(key);
  };

  const isHistoryDetail = activeTab === "dashboard" && selectedHistory;

  return (
    <SettingsContext.Provider value={{ threshold, setThreshold }}>
      <div className="pressure-page">
        <div className="pressure-header">
          <div className="header-left">
            {isHistoryDetail && (
              <button
                type="button"
                className="back-button"
                aria-label="Quay lại lịch sử"
                title="Quay lại lịch sử"
                onClick={handleBackToHistory}
              >
                <ArrowLeftOutlined /> Quay lại
              </button>
            )}

            <div className="title">
              {isHistoryDetail
                ? "Chi tiết kiểm tra"
                : "Hệ thống kiểm tra áp suất lốp"}
            </div>

            <Tabs
              className="tabs"
              items={items}
              activeKey={activeTab}
              onChange={handleTabChange}
            />
          </div>

          <div className="header-actions">
            <div className="online-status">
              <span className="online-dot" />
              <span className="online-text">ONLINE</span>
            </div>

            <button
              type="button"
              className="header-icon-button"
              aria-label="Cài đặt"
              onClick={handleOpenSetting}
            >
              <SettingOutlined />
            </button>

            <button
              type="button"
              className="header-icon-button power-button"
              aria-label="Nguồn"
              onClick={() => setOpenPowerModal(true)}
            >
              <PoweroffOutlined />
            </button>
          </div>
        </div>

        <div className="pressure-body">
          <div
            className={`dashboard-tab-panel ${
              activeTab === "dashboard" ? "is-active" : "is-inactive"
            }`}
          >
            <DashboardPage
              historyDetail={selectedHistory}
              realtimeEnabled
              onMeasurementStart={handleMeasurementStart}
              visible={activeTab === "dashboard"}
            />
          </div>
          <div
            className={`history-tab-panel ${
              activeTab === "history" ? "is-active" : "is-inactive"
            }`}
          >
            <HistoryPage
              resetKey={historyResetKey}
              onViewDetail={handleViewHistoryDetail}
            />
          </div>
        </div>

        <SettingModal
          open={openModal}
          minValue={threshold.min}
          maxValue={threshold.max}
          leakMaxValue={threshold.leakMax}
          onCancel={handleCloseSetting}
          onSave={handleSaveSetting}
        />
        <PowerConfirmModal
          open={openPowerModal}
          onCancel={() => setOpenPowerModal(false)}
          onConfirm={() => {
            setOpenPowerModal(false);
            handleCloseApp();
          }}
        />
      </div>
    </SettingsContext.Provider>
  );
}

export default AppLayout;
