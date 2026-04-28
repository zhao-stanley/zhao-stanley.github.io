import { createApp, ref, computed } from "vue";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

const chatSchema = {
  properties: {
    value: {
      required: ["activity", "type", "title", "channel", "published"],
      properties: {
        activity: { const: "Create" },
        type: { const: "Chat" },
        title: { type: "string" },
        channel: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

const joinSchema = {
  properties: {
    value: {
      required: ["activity", "target"],
      properties: {
        activity: { const: "Join" },
        target: { type: "string" },
        title: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

const chatItemSchema = {
  properties: {
    value: {
      properties: {
        activity: { type: "string" },
        object: { type: "string" },
        content: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

function setup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();

  const isSidebarOpen = ref(true);
  const activeChannel = ref(null);
  const activeTitle = ref("");
  const myMessage = ref("");
  const isSending = ref(false);
  const isStarNext = ref(false);
  const isRecapOpen = ref(false);
  const isCreateOpen = ref(false);
  const newTitle = ref("");
  const isCreating = ref(false);
  const isLeaving = ref(false);
  const isJoinOpen = ref(false);
  const inviteId = ref("");
  const isJoining = ref(false);
  const justCopied = ref(false);

  const { objects: myJoinObjects, isFirstPoll: areMyChatsLoading } =
    useGraffitiDiscover(
      () => (session.value ? [session.value.actor] : []),
      joinSchema,
      undefined,
      true,
    );

  const { objects: chatItemObjects, isFirstPoll: areMessagesLoading } =
    useGraffitiDiscover(
      () => (activeChannel.value ? [activeChannel.value] : []),
      chatItemSchema,
      undefined,
      true,
    );

  const myChats = computed(() => {
    const byChannel = new Map();
    for (const j of myJoinObjects.value) {
      const ch = j.value.target;
      const existing = byChannel.get(ch);
      if (!existing || (j.value.published || 0) > (existing.value.published || 0)) {
        byChannel.set(ch, j);
      }
    }
    return [...byChannel.values()].toSorted(
      (a, b) => (b.value.published || 0) - (a.value.published || 0),
    );
  });

  const sortedMessages = computed(() =>
    chatItemObjects.value
      .filter((o) => o.value && typeof o.value.content === "string")
      .toSorted(
        (a, b) => (a.value.published || 0) - (b.value.published || 0),
      ),
  );

  const starObjects = computed(() =>
    chatItemObjects.value.filter(
      (o) => o.value && o.value.activity === "Star" && o.value.object,
    ),
  );

  const starredUrls = computed(
    () => new Set(starObjects.value.map((s) => s.value.object)),
  );

  const starredMessages = computed(() =>
    sortedMessages.value.filter((m) => starredUrls.value.has(m.url)),
  );

  function isStarred(url) {
    return starredUrls.value.has(url);
  }

  function myStarsFor(url) {
    const me = session.value?.actor;
    return starObjects.value.filter(
      (s) => s.value.object === url && s.actor === me,
    );
  }

  function fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    return sameDay
      ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  async function postJoin(channel, title) {
    await graffiti.post(
      {
        value: {
          activity: "Join",
          target: channel,
          title,
          published: Date.now(),
        },
        channels: [session.value.actor, channel],
      },
      session.value,
    );
  }

  function openChat(channel, title) {
    activeChannel.value = channel;
    activeTitle.value = title || "Chat";
    isRecapOpen.value = false;
    if (window.innerWidth < 720) isSidebarOpen.value = false;
  }

  async function createChat() {
    if (!newTitle.value.trim()) return;
    isCreating.value = true;
    try {
      const channel = crypto.randomUUID();
      const title = newTitle.value.trim();
      await graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Chat",
            title,
            channel,
            published: Date.now(),
          },
          channels: [channel],
        },
        session.value,
      );
      await postJoin(channel, title);
      openChat(channel, title);
      isCreateOpen.value = false;
      newTitle.value = "";
    } finally {
      isCreating.value = false;
    }
  }

  async function fetchChatTitle(channel) {
    try {
      const iter = graffiti.discover([channel], chatSchema, session.value);
      for await (const r of iter) {
        const t = r?.object?.value?.title;
        if (t) return t;
      }
    } catch {}
    return "Chat";
  }

  async function joinByInvite() {
    const channel = inviteId.value.trim();
    if (!channel) return;
    isJoining.value = true;
    try {
      const title = await fetchChatTitle(channel);
      await postJoin(channel, title);
      openChat(channel, title);
      inviteId.value = "";
      isJoinOpen.value = false;
    } finally {
      isJoining.value = false;
    }
  }

  async function copyInvite() {
    if (!activeChannel.value) return;
    await navigator.clipboard.writeText(activeChannel.value);
    justCopied.value = true;
    setTimeout(() => (justCopied.value = false), 1200);
  }

  async function leaveChat() {
    if (!activeChannel.value) return;
    if (!confirm(`Leave "${activeTitle.value}"?`)) return;
    isLeaving.value = true;
    try {
      const mine = myJoinObjects.value.filter(
        (j) => j.value.target === activeChannel.value,
      );
      await Promise.all(mine.map((j) => graffiti.delete(j, session.value)));
      activeChannel.value = null;
      activeTitle.value = "";
    } finally {
      isLeaving.value = false;
    }
  }

  async function sendMessage() {
    if (!myMessage.value.trim()) return;
    isSending.value = true;
    const content = myMessage.value.trim();
    const wantStar = isStarNext.value;
    try {
      const posted = await graffiti.post(
        {
          value: { content, published: Date.now() },
          channels: [activeChannel.value],
        },
        session.value,
      );
      if (wantStar) {
        await graffiti.post(
          {
            value: {
              activity: "Star",
              object: posted.url,
              published: Date.now(),
            },
            channels: [activeChannel.value],
          },
          session.value,
        );
      }
      myMessage.value = "";
      isStarNext.value = false;
    } finally {
      isSending.value = false;
    }
  }

  const isDeleting = ref(new Set());
  async function deleteMessage(msg) {
    if (!confirm("Unsend this message?")) return;
    isDeleting.value.add(msg.url);
    try {
      await graffiti.delete(msg, session.value);
    } finally {
      isDeleting.value.delete(msg.url);
    }
  }

  async function toggleStar(msg) {
    const mine = myStarsFor(msg.url);
    if (mine.length) {
      await Promise.all(mine.map((s) => graffiti.delete(s, session.value)));
    } else {
      await graffiti.post(
        {
          value: {
            activity: "Star",
            object: msg.url,
            published: Date.now(),
          },
          channels: [activeChannel.value],
        },
        session.value,
      );
    }
  }

  return {
    isSidebarOpen,
    activeChannel,
    activeTitle,
    myMessage,
    isSending,
    isStarNext,
    isRecapOpen,
    isCreateOpen,
    newTitle,
    isCreating,
    isLeaving,
    isJoinOpen,
    inviteId,
    isJoining,
    justCopied,
    isDeleting,
    myChats,
    sortedMessages,
    starredMessages,
    areMyChatsLoading,
    areMessagesLoading,
    isStarred,
    fmtTime,
    openChat,
    createChat,
    joinByInvite,
    copyInvite,
    leaveChat,
    sendMessage,
    deleteMessage,
    toggleStar,
  };
}

const App = { template: "#template", setup };

createApp(App)
  .use(GraffitiPlugin, {
    graffiti: new GraffitiDecentralized(),
  })
  .mount("#app");
