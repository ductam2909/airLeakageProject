/* eslint-disable react-hooks/set-state-in-effect */
import { Modal, Button, Progress, Input, Checkbox, message } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import { useState } from "react";
import { putRequest } from "../../services/request";

function SuccessModal({ idHistory, open, onCancel, data2, threshold }) {
  const data = {
  id: 1,
  trayCode: "MAMXE-007",
  programName: "PROGRAM_01",

  startTime: "2026-09-28 14:30:00",
  endTime: "2026-09-28 14:30:30",

  pressureUnit: "Pa",
  leakUnit: "Pa/s",

  actualPressure: 420,
  actualLeak: 16,

  testTime: 30,
  settingCycleTime: 30,

  status: "PASS",

  cycleEnd: true,

  dataPressure: [
    0, 35, 70, 105, 140,
    175, 210, 245, 280, 310,
    335, 355, 375, 395, 410,
    423, 435, 445, 454, 462,
    469, 475, 480, 484, 487,
    489, 490, 490, 490, 490,
  ],

  dataLeak: [
    1.2, 1.8, 2.5, 3.1, 3.8,
    4.5, 5.3, 6.1, 7.0, 7.8,
    8.7, 9.5, 10.4, 11.2, 12.0,
    12.8, 13.5, 14.1, 14.6, 15.0,
    15.3, 15.5, 15.7, 15.8, 15.9,
    16.0, 16.0, 16.0, 16.0, 16.0,
  ],
};

  const [dataModal, setDataModal] = useState(() => ({
    trayCode: data?.trayCode || "",
  }));
  const [isEditTrayCode, setIsEditTrayCode] = useState(false);

  const handleClose = async () => {
    // Không chọn cập nhật mã mâm xe
    if (!isEditTrayCode) {
      onCancel?.();
      return;
    }

    // Chưa có ID history
    if (!idHistory) {
      message.error("Không tìm thấy lịch sử đo");
      return;
    }

    // Validate mã mâm xe
    if (!dataModal?.trayCode?.trim()) {
      message.warning("Vui lòng nhập mã mâm xe");
      return;
    }

    try {
      await putRequest(`/api/history/${idHistory}`, dataModal);

      message.success("Cập nhật mã mâm xe thành công");

      onCancel?.();
    } catch (error) {
      console.error("Lỗi", error);
      message.error("Cập nhật lịch sử thất bại");
    }
  };

  return (
    <Modal
      open={open}
      centered
      width={650}
      footer={null}
      closable={false}
      keyboard={false}
      maskClosable={false}
      onCancel={onCancel}
      className="measurement-success-modal"
    >
      {/* HEADER */}
      <div className="success-header">
        <div className="success-icon">
          <CheckCircleOutlined />
        </div>

        <div>
          <div className="success-title">Đã hoàn thành tiến trình đo!</div>

          <div className="success-subtitle">
            Chu trình kiểm tra độ kín khí thành công
          </div>
        </div>
      </div>

      <div className="success-divider" />

      {/* PROGRESS */}
      <div className="progress-card">
        <div className="progress-title">Tiến độ: 100% ({data?.testTime}s)</div>
        <Progress
          percent={100}
          showInfo={false}  
          strokeWidth={11}
          strokeColor="#4fbd83"
        />
      </div>

      {/* INFORMATION */}
      <div className="measurement-grid">
        {/* MÃ MÂM XE */}
        <div className="measurement-card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div className="measurement-label">MÃ MÂM XE</div>

            <Checkbox
              checked={isEditTrayCode}
              onChange={(e) => setIsEditTrayCode(e.target.checked)}
            >
              Chỉnh sửa
            </Checkbox>
          </div>

          <Input
            value={dataModal?.trayCode}
            disabled={!isEditTrayCode}
            onChange={(e) => {
              setDataModal((prev) => ({
                ...prev,
                trayCode: e.target.value,
              }));
            }}
            className="tray-code-input"
          />

          <div className="measurement-description">
            Thiết bị kiểm định tiêu chuẩn
          </div>
        </div>

        {/* TRẠNG THÁI */}
        <div className="measurement-card">
          <div className="measurement-label">TRẠNG THÁI</div>

          <div>
            <span
              className={
                data?.status === "PASS"
                  ? "status-badge status-pass"
                  : "status-badge status-fail"
              }
            >
              {data?.status}
            </span>
          </div>

          <div
            className={
              data?.status === "PASS"
                ? "measurement-description success-text"
                : "measurement-description fail-text"
            }
          >
            Đã lưu vào dữ liệu lịch sử đo
          </div>
        </div>

        {/* ÁP SUẤT */}
        <div className="measurement-card">
          <div className="measurement-label">ÁP SUẤT KIỂM TRA</div>

          <div className="measurement-value pressure-value">
            {data?.actualPressure}
            <span>Pa</span>
          </div>

          <div className="measurement-description success-text">
            Đạt tiêu chuẩn {threshold?.min} - {threshold?.max} Pa
          </div>
        </div>

        {/* RÒ RỈ */}
        <div className="measurement-card">
          <div className="measurement-label">MỨC ĐỘ RÒ RỈ KHÍ</div>

          <div className="measurement-value leak-value">
            {data?.actualLeak}
            <span>Pa/s</span>
          </div>

          <div className="measurement-description success-text">
            Dưới ngưỡng an toàn {Number(threshold?.leakMax).toFixed(1)} Pa/s
          </div>
        </div>
      </div>

      <div className="success-divider bottom-divider" />

      {/* FOOTER */}
      <div className="success-footer">
        <Button
          size="large"
          className="close-success-button"
          onClick={handleClose}
        >
          Đóng
        </Button>
      </div>
    </Modal>
  );
}

export default SuccessModal;
