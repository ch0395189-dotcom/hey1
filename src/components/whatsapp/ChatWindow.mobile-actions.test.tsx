import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ChatWindow } from "./ChatWindow";

const mockNavigate = vi.fn();
const mockToast = vi.fn();
const mockRpc = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => true,
}));

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

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("emoji-picker-react", () => ({
  default: () => <div data-testid="emoji-picker" />,
}));

vi.mock("@/integrations/supabase/client", () => {
  const terminal = (value: unknown) => Promise.resolve(value);

  const builder = (table: string) => {
    const api: Record<string, unknown> = {
      select: vi.fn(() => api),
      eq: vi.fn(() => api),
      order: vi.fn(() => terminal({ data: table === "messages" ? [] : [], error: null })),
      update: vi.fn(() => api),
      insert: vi.fn(() => api),
      delete: vi.fn(() => api),
      upsert: vi.fn(() => api),
      maybeSingle: vi.fn(() => {
        if (table === "team_agents") return terminal({ data: null, error: null });
        return terminal({ data: null, error: null });
      }),
      single: vi.fn(() => {
        if (table === "whatsapp_accounts") return terminal({ data: { connection_type: "meta" }, error: null });
        if (table === "chatbot_configs") return terminal({ data: null, error: null });
        return terminal({ data: null, error: null });
      }),
    };
    return api;
  };

  return {
    supabase: {
      auth: {
        getUser: vi.fn(() => terminal({ data: { user: { id: "owner-1" } }, error: null })),
      },
      from: vi.fn((table: string) => builder(table)),
      rpc: mockRpc,
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
      })),
      removeChannel: vi.fn(),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(() => terminal({ data: {}, error: null })),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.com/file" } })),
        })),
      },
      functions: {
        invoke: vi.fn(() => terminal({ data: {}, error: null })),
      },
    },
  };
});

const conversation = {
  id: "conv-1",
  customer_name: "Cliente Prueba",
  customer_phone: "+573001112233",
  customer_profile_pic: null,
  is_archived: false,
  platform: "whatsapp",
  platform_account_id: null,
  whatsapp_account_id: "wa-1",
  assigned_to: null,
};

const renderChat = () => render(
  <MemoryRouter>
    <ChatWindow conversation={conversation} onConversationUpdated={vi.fn()} onBack={vi.fn()} />
  </MemoryRouter>,
);

describe("ChatWindow mobile header actions", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockToast.mockClear();
    mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  });

  it("abre el menú de tres puntos con toque y mantiene disponibles las acciones del chat", async () => {
    renderChat();

    fireEvent.pointerDown(screen.getByLabelText("Más opciones"), { pointerType: "touch" });

    expect(await screen.findByText("Gestionar etiquetas")).toBeInTheDocument();
    expect(screen.getByText("Bloquear contacto")).toBeInTheDocument();
    expect(screen.getByText("Archivar")).toBeInTheDocument();
    expect(screen.getByText("Eliminar")).toBeInTheDocument();
    expect(screen.queryByText("Asignar a")).not.toBeInTheDocument();
  });

  it("abre asignación de agente con toque, cierra los tres puntos y permite asignar sin afectar otras acciones", async () => {
    renderChat();

    fireEvent.pointerDown(screen.getByLabelText("Más opciones"), { pointerType: "touch" });
    expect(await screen.findByText("Gestionar etiquetas")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByLabelText("Asignar agente"), { pointerType: "touch" });

    expect(await screen.findByText("Asignar a")).toBeInTheDocument();
    expect(screen.getByText("Yo (propietario)")).toBeInTheDocument();
    expect(screen.getByText("+ Invitar agentes")).toBeInTheDocument();
    expect(screen.queryByText("Gestionar etiquetas")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Yo (propietario)"));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith("assign_conversation", {
        p_conversation_id: "conv-1",
        p_agent_user_id: "owner-1",
      });
    });
  });
});
