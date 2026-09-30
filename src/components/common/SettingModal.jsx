import { useEffect, useState } from "react";
import { Alert, Modal, Form, InputNumber, Button } from "antd";
import {
  SettingOutlined,
  CheckOutlined,
  MinusOutlined,
  PlusOutlined,
} from "@ant-design/icons";

function ThresholdStepper({
  value,
  onChange,
  unit,
  label,
  step = 1,
  ...inputProps
}) {
  const adjust = (direction) => {
    const next = Math.max(0, Number(value || 0) + direction * step);
    onChange(Number(next.toFixed(2)));
  };

  return (
    <div className="threshold-stepper">
      <Button
        htmlType="button"
        className="step-button"
        aria-label={`Giảm ${label}`}
        icon={<MinusOutlined />}
        disabled={inputProps.disabled || !(value > 0)}
        onClick={() => adjust(-1)}
      />
      <InputNumber
        {...inputProps}
        value={value}
        onChange={onChange}
        aria-label={label}
        min={0}
        step={step}
        precision={step < 1 ? 1 : undefined}
        controls={false}
        suffix={unit}
        formatter={(number, { userTyping, input }) =>
          userTyping
            ? input
            : number === "" || number == null
              ? ""
              : step < 1
                ? Number(number).toFixed(1)
                : String(number)
        }
        className="threshold-input"
      />
      <Button
        htmlType="button"
        className="step-button"
        aria-label={`Tăng ${label}`}
        icon={<PlusOutlined />}
        disabled={inputProps.disabled}
        onClick={() => adjust(1)}
      />
    </div>
  );
}

function SettingModal({
  open,
  onCancel,
  onSave,
  minValue = 100,
  maxValue = 500,
  leakMaxValue = 25,
}) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        minPressure: minValue,
        maxPressure: maxValue,
        leakMax: leakMaxValue,
      });
    }
  }, [open, minValue, maxValue, leakMaxValue, form]);

  const handleFinish = async (values) => {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSave(values);
    } catch {
      setSaveError("Không thể lưu cài đặt. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  const pressureRule = (otherField, isMin) => ({
    validator: (_, value) => {
      const other = form.getFieldValue(otherField);
      if (
        value != null &&
        other != null &&
        (isMin ? value >= other : value <= other)
      ) {
        return Promise.reject(
          new Error(
            isMin
              ? "Ngưỡng Min phải nhỏ hơn ngưỡng Max"
              : "Ngưỡng Max phải lớn hơn ngưỡng Min",
          ),
        );
      }
      return Promise.resolve();
    },
  });
  const requiredRules = [
    { required: true, message: "Vui lòng nhập ngưỡng đo" },
    { type: "number", min: 0, message: "Ngưỡng đo phải lớn hơn hoặc bằng 0" },
  ];
  const rows = [
    {
      name: "maxPressure",
      label: "Ngưỡng áp suất Max",
      description: "Áp suất tối đa cho phép",
      tone: "max",
      unit: "Pa",
      dependencies: ["minPressure"],
      rules: [...requiredRules, pressureRule("minPressure", false)],
    },
    {
      name: "minPressure",
      label: "Ngưỡng áp suất Min",
      description: "Áp suất tối thiểu cho phép",
      tone: "min",
      unit: "Pa",
      dependencies: ["maxPressure"],
      rules: [...requiredRules, pressureRule("maxPressure", true)],
    },
    {
      name: "leakMax",
      label: "Ngưỡng rò rỉ khí Max",
      description: "Hệ thống báo Fail nếu rò rỉ vượt mức",
      tone: "leak",
      unit: "Pa/s",
      // step: 0.1,
      rules: requiredRules,
    },
  ];

  return (
    <Modal
      open={open}
      centered
      width={600}
      footer={null}
      onCancel={saving ? undefined : onCancel}
      closable={!saving}
      mask={{ closable: !saving }}
      keyboard={!saving}
      destroyOnHidden
      afterClose={() => setSaveError("")}
      className="pressure-threshold-modal"
      classNames={{ mask: "threshold-modal-mask" }}
      title={
        <div className="modal-header-custom">
          <span className="modal-icon">
            <SettingOutlined />
          </span>
          <div className="modal-title">
            <h3>Cài đặt ngưỡng đo</h3>
            <p>Thiết lập tiêu chuẩn kiểm tra hệ thống đo</p>
          </div>
        </div>
      }
    >
      <Form
        form={form}
        name="pressure-threshold-form"
        id="pressure-threshold-form"
        className="threshold-form"
        onFinish={handleFinish}
        disabled={saving}
      >
        <div className="threshold-rows">
          {rows.map((row) => (
            <div
              className={`threshold-row threshold-row-${row.tone}`}
              key={row.name}
            >
              <div className="threshold-copy">
                <label htmlFor={`pressure-threshold-form_${row.name}`}>
                  <span className="threshold-dot" />
                  {row.label}
                </label>
                <p>{row.description}</p>
              </div>
              <Form.Item
                name={row.name}
                dependencies={row.dependencies}
                rules={row.rules}
              >
                <ThresholdStepper
                  label={row.label}
                  unit={row.unit}
                  step={row.step}
                  disabled={saving}
                />
              </Form.Item>
            </div>
          ))}
          {saveError && <Alert type="error" showIcon title={saveError} />}
        </div>
        <div className="modal-actions">
          <Button
            htmlType="button"
            className="cancel-button"
            onClick={onCancel}
            disabled={saving}
          >
            Hủy bỏ
          </Button>
          <Button
            type="primary"
            className="save-button"
            icon={<CheckOutlined />}
            htmlType="submit"
            loading={saving}
          >
            Lưu cài đặt
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

export default SettingModal;
