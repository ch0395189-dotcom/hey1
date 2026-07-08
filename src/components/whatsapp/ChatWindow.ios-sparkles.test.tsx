import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Force iOS user agent BEFORE importing ChatWindow ---
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const originalUA = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
Object.defineProperty(window.navigator, "userAgent", { value: IOS_UA, configurable: true });

import { ChatWindow } from "./ChatWindow";

const { mockNavigate, mockToast } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

vi.mock("@/hooks/useTeam", () => ({
  useTeam: () => ({
    isAgent: false,
    ownerId: "owner-1",
    myPermissions: {
      tag_contacts: true,
      block_contacts: true,
      archive_conversations: true,
      create_tags: true,
      view_contacts: true,
      view_statistics: true,
    },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock("emoji-picker-react", () => ({ default: () => <div data-testid="emoji-picker" /> }));

// Stub the dialog so we can assert it opens without needing its full internals.
vi.mock("@/components/whatsapp/ClonedVoicePreviewDialog", () => ({
  ClonedVoicePreviewDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="cloned-voice-dialog">voice dialog open</div> : null,
}));

vi.mock("@/integrations/supabase/client", () => {
  const terminal = (value: unknown) => Promise.resolve(value);
  const builder = (table: string) => {
    const api: Record<string, unknown> = {
      select: vi.fn(() => api),
      eq: vi.fn(() => api),
      in: vi.fn(() => api),
      order: vi.fn(() => terminal({ data: [], error: null })),
      update: vi.fn(() => api),
      insert: vi.fn(() => api),
      delete: vi.fn(() => api),
      upsert: vi.fn(() => api),
      maybeSingle: vi.fn(() => terminal({ data: null, error: null })),
      single: vi.fn(() => {
        if (table === "whatsapp_accounts")
          return terminal({ data: { connection_type: "meta" }, error: null });
        return terminal({ data: null, error: null });
      }),
    };
    return api;
  };
  return {
    supabase: {
      auth: {
        getUser: vi.fn(() => terminal({ data: { user: { id: "owner-1" } }, error: null })),
        getSession: vi.fn(() => terminal({ data: { session: null }, error: null })),
      },
      from: vi.fn((table: string) => builder(table)),
      rpc: vi.fn(() => terminal({ data: null, error: null })),
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
      removeChannel: vi.fn(),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(() => terminal({ data: {}, error: null })),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.com/file" } })),
        })),
      },
      functions: { invoke: vi.fn(() => terminal({ data: {}, error: null })) },
    },
  };
});

const conversation = {
  id: "conv-ios-1",
  customer_name: "Cliente iOS",
  customer_phone: "+573001112233",
  customer_profile_pic: null,
  is_archived: false,
  platform: "whatsapp",
  platform_account_id: null,
  whatsapp_account_id: "wa-1",
  assigned_to: null,
};

const renderChat = () =>
  render(
    <MemoryRouter>
      <ChatWindow conversation={conversation} onConversationUpdated={vi.fn()} onBack={vi.fn()} />
    </MemoryRouter>,
  );

describe("ChatWindow ✨ Sparkles button on iOS", () => {
  beforeEach(() => {
    mockToast.mockClear();
  });
  afterEach(() => {
    if (originalUA) Object.defineProperty(window.navigator, "userAgent", originalUA);
  });

  it("abre el diálogo de voz clonada en el primer toque iOS aunque el teclado esté abierto", async () => {
    renderChat();

    // Type text so the ✨ Sparkles button renders.
    const input = screen.getByPlaceholderText("Escribe un mensaje");
    fireEvent.change(input, { target: { value: "Hola desde iOS" } });
    input.focus();
    expect(input).toHaveFocus();

    const sparklesBtn = await screen.findByTitle(
      "Enviar como nota de voz clonada (vista previa)",
    );
    expect(sparklesBtn).toBeInTheDocument();

    // On real iOS with the keyboard open, Safari can consume the tap after
    // touchstart to blur the input, so touchend/click may never activate the
    // button. The action must therefore run on touchstart without preventDefault.
    const touchStartEvt = fireEvent.touchStart(sparklesBtn, { touches: [{ clientX: 10, clientY: 10 }] });
    expect(touchStartEvt).toBe(true); // event not preventDefault'd

    await waitFor(() => {
      expect(screen.getByTestId("cloned-voice-dialog")).toBeInTheDocument();
    });
    expect(input).not.toHaveFocus();
  });

  it("no abre el diálogo dos veces cuando iOS dispara touchend y click seguidos", async () => {
    renderChat();
    const input = screen.getByPlaceholderText("Escribe un mensaje");
    fireEvent.change(input, { target: { value: "Doble tap" } });

    const sparklesBtn = await screen.findByTitle(
      "Enviar como nota de voz clonada (vista previa)",
    );

    const touchStartEvt = fireEvent.touchStart(sparklesBtn);
    const touchEndEvt = fireEvent.touchEnd(sparklesBtn);
    fireEvent.click(sparklesBtn);

    expect(touchStartEvt).toBe(true);
    expect(touchEndEvt).toBe(true);

    await waitFor(() => {
      expect(screen.getAllByTestId("cloned-voice-dialog")).toHaveLength(1);
    });
  });
});
