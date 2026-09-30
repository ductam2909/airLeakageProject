import { Modal, Button } from "antd";
// import { PoweroffOutlined } from "@ant-design/icons";

function PowerConfirmModal({
  open,
  onCancel,
  onConfirm,
  title = "Đóng chương trình?",
  description = "Hệ thống đo sẽ ngừng hoạt động và ngắt kết nối thiết bị.",
  confirmText = "Đồng ý đóng",
}) {
  return (
    <Modal
      open={open}
      centered
      footer={null}
      closable={false}
      width={520}
      className="power-confirm-modal"
      onCancel={onCancel}
      // maskClosable={false}
    >
      <div className="power-modal-content">
        {/* <div className="power-icon">
          <PoweroffOutlined />
        </div> */}

        <h3>{title}</h3>

        <p>{description}</p>

        <div className="power-actions">
          <Button
            className="cancel-button"
            onClick={onCancel}
          >
            Hủy bỏ
          </Button>

          <Button
            type="primary"
            danger
            className="confirm-button"
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default PowerConfirmModal;