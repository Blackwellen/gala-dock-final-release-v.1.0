// Gala Dock — canonical messaging types shared by the full Inbox, the Gala
// Copilot panel's Inbox tab, and the Event Profile Comms tab. All three
// surfaces read/write the same conversations/messages tables — do not add
// surface-specific duplicate shapes here.

export type ConversationType =
  | "direct_internal"
  | "group_internal"
  | "client_direct"
  | "client_group"
  | "supplier_direct"
  | "supplier_group"
  | "mixed_external"
  | "event_internal"
  | "event_client"
  | "event_supplier"
  | "internal_note_thread";

export type ParticipantKind = "internal" | "client" | "supplier" | "guest";
export type ParticipantRole = "owner" | "admin" | "member" | "guest";
export type MessageVisibility = "standard" | "internal_note";
export type MessageStatus = "sent" | "edited" | "withdrawn";
export type InboxTab = "all" | "unread" | "conversations" | "internal";

/** Badge shown on a conversation row: derived from type, not stored directly. */
export type ConversationBadge = "Client" | "Supplier" | "Internal";

export function badgeForConversationType(type: ConversationType): ConversationBadge {
  if (type === "client_direct" || type === "client_group" || type === "event_client") return "Client";
  if (type === "supplier_direct" || type === "supplier_group" || type === "event_supplier") return "Supplier";
  return "Internal";
}

export function isInternalType(type: ConversationType): boolean {
  return badgeForConversationType(type) === "Internal";
}

export interface ConversationParticipantSummary {
  id: string;
  userId: string | null;
  displayName: string;
  externalOrgName: string | null;
  kind: ParticipantKind;
  role: ParticipantRole;
  isSelf: boolean;
}

export interface ConversationSummary {
  id: string;
  type: ConversationType;
  badge: ConversationBadge;
  title: string;
  externalOrgName: string | null;
  eventId: string | null;
  eventName: string | null;
  participants: ConversationParticipantSummary[];
  participantCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderName: string | null;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  avatarInitials: string;
}

export interface InboxMetrics {
  totalConversations: number;
  unreadConversations: number;
  clientSupplierConversations: number;
  internalNoteConversations: number;
}

export interface MessageAttachmentSummary {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  r2Key: string;
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  reactedBySelf: boolean;
  userIds: string[];
}

export interface MessageSummary {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  senderName: string;
  senderType: "internal" | "client" | "supplier" | "system";
  isSelf: boolean;
  body: string;
  visibility: MessageVisibility;
  status: MessageStatus;
  replyToMessageId: string | null;
  createdAt: string;
  editedAt: string | null;
  withdrawnAt: string | null;
  readBySelf: boolean;
  seenByCount: number;
  attachments: MessageAttachmentSummary[];
  reactions: MessageReactionSummary[];
}

export interface ConversationDetail extends ConversationSummary {
  visibility: "internal" | "external";
}
