import { useEffect, useState } from "react";
import { ArrowLeftOutlined, LogoutOutlined } from "@ant-design/icons";
import HistoryWeb from "../pages/HistoryWeb";
import DashboardPage from "../pages/DashboardPage";
import { SettingsContext } from "../contexts/SettingsContext.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { getRequest } from "../services/request";
import PowerConfirmModal from "../components/common/PowerConfirmModal.jsx";

function mapPressureThreshold(settings = {}) {
  return {
    min: Number(settings.pressure_min ?? 100),
    max: Number(settings.pressure_max ?? 500),
    leakMax: Number(settings.leak_max ?? 25),
  };
}

function WebLayout() {
  const { logout, user } = useAuth();
  const [threshold, setThreshold] = useState({
    min: 100,
    max: 500,
    leakMax: 25,
  });
  const [openLogoutModal, setOpenLogoutModal] = useState(false);

  // "history" | "dashboard"
  const [activeView, setActiveView] = useState("history");
  const [selectedHistory, setSelectedHistory] = useState(null);

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

  const handleViewDetail = (detail) => {
    setSelectedHistory(detail);
    setActiveView("dashboard");
  };

  const handleBack = () => {
    setSelectedHistory(null);
    setActiveView("history");
  };

  const isDashboard = activeView === "dashboard";

  return (
    <SettingsContext.Provider value={{ threshold, setThreshold }}>
      <div className="pressure-page">
        <div className="pressure-header">
          <div className="header-left">
            {isDashboard && (
              <button
                type="button"
                className="back-button"
                aria-label="Quay lại lịch sử"
                title="Quay lại lịch sử"
                onClick={handleBack}
              >
                <ArrowLeftOutlined /> Quay lại
              </button>
            )}
            <div className="title">
              {isDashboard ? "Chi tiết kiểm tra" : "Hệ thống kiểm tra áp suất lốp"}
            </div>
            {isDashboard && selectedHistory?.trayCode && (
              <span className="web-detail-badge">{selectedHistory.trayCode}</span>
            )}
          </div>

          <div className="header-actions">
            <div className="online-status">
              <span className="online-dot" />
              <span className="online-text">ONLINE</span>
            </div>

            {user?.username && (
              <span className="web-username">{user.username}</span>
            )}

            <button
              type="button"
              className="header-icon-button logout-button"
              aria-label="Đăng xuất"
              title="Đăng xuất"
              onClick={() => setOpenLogoutModal(true)}
            >
              <LogoutOutlined />
            </button>
          </div>
        </div>

        <div className="pressure-body">
          <div
            className={`dashboard-tab-panel ${
              isDashboard ? "is-active" : "is-inactive"
            }`}
          >
            <DashboardPage historyDetail={selectedHistory} />
          </div>

          <div
            className={`history-tab-panel ${
              isDashboard ? "is-inactive" : "is-active"
            }`}
          >
            <HistoryWeb onViewDetail={handleViewDetail} />
          </div>
        </div>
      </div>

      <PowerConfirmModal
        open={openLogoutModal}
        title="Đăng xuất?"
        description="Bạn sẽ được chuyển về trang đăng nhập."
        confirmText="Đồng ý đăng xuất"
        onCancel={() => setOpenLogoutModal(false)}
        onConfirm={() => {
          setOpenLogoutModal(false);
          logout();
        }}
      />
    </SettingsContext.Provider>
  );
}

export default WebLayout;
