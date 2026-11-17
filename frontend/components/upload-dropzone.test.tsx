import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UploadDropzone } from "@/components/upload-dropzone";

describe("UploadDropzone", () => {
  it("rejects an unsupported file before upload", async () => {
    const onUpload = vi.fn();
    render(<UploadDropzone onUpload={onUpload} />);
    const input = screen.getByLabelText(/browse files/i);
    fireEvent.change(input, {
      target: { files: [new File(["x"], "notes.exe", { type: "application/octet-stream" })] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/pdf, txt, markdown, or docx/i);
    expect(onUpload).not.toHaveBeenCalled();
  });
});
