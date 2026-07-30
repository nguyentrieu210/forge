import * as React from "react";
import { Button, type ButtonProps } from "./button.js";

export interface FileButtonProps extends Omit<ButtonProps, "onChange"> {
  accept?: string;
  capture?: boolean | "user" | "environment";
  multiple?: boolean;
  onFiles: (files: FileList | null) => void;
}

/** Nút chọn tệp — bọc <input type=file> ẩn (nơi DUY NHẤT dùng native file input, trong @metaforge/ui). */
export const FileButton = React.forwardRef<HTMLButtonElement, FileButtonProps>(
  ({ accept, capture, multiple, onFiles, children, disabled, onClick, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    return (
      <>
        {/*
          onClick được BỌC chứ không để `{...props}` ghi đè.
          Trước đây `{...props}` trải SAU onClick nội bộ, nên bất kỳ nơi gọi nào truyền onClick
          (ví dụ để stopPropagation trong một hàng bảng bấm được) sẽ xoá luôn lệnh mở hộp chọn
          tệp — nút vẫn hiện, vẫn bấm được, nhưng KHÔNG có gì xảy ra và không có lỗi nào báo ra.
        */}
        <Button
          ref={ref}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          {...props}
          onClick={(e) => {
            onClick?.(e);
            if (e.defaultPrevented) return; // nơi gọi chủ động huỷ thì tôn trọng
            inputRef.current?.click();
          }}
        >
          {children}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          capture={capture}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </>
    );
  },
);
FileButton.displayName = "FileButton";
