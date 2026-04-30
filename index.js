import { createApp, ref, computed, provide } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { MessageBubble } from "./components/message-bubble.js";

function loadComponent(name) {
  return () => import(`./${name}/main.js`).then((m) => m.default());
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: loadComponent("home") },
    { path: "/chat/:chatId", component: loadComponent("chat"), props: true },
    { path: "/newchat", component: loadComponent("newchat") },
    { path: "/about", component: loadComponent("about") },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

export const chatSchema = {
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

export const joinSchema = {
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

export const chatItemSchema = {
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
  const isJoinOpen = ref(false);
  const inviteId = ref("");
  const isJoining = ref(false);

  const { objects: myJoinObjects, isFirstPoll: areMyChatsLoading } =
    useGraffitiDiscover(
      () => (session.value ? [session.value.actor] : []),
      joinSchema,
    );

  const myChats = computed(() => {
    const me = session.value?.actor;
    if (!me) return [];
    const byChannel = new Map();
    for (const j of myJoinObjects.value) {
      if (j.actor !== me) continue;
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
      inviteId.value = "";
      isJoinOpen.value = false;
      router.push(`/chat/${encodeURIComponent(channel)}`);
    } finally {
      isJoining.value = false;
    }
  }

  function onChatClick() {
    if (window.innerWidth < 720) isSidebarOpen.value = false;
  }

  provide("graffiti", graffiti);
  provide("session", session);
  provide("myChats", myChats);
  provide("myJoinObjects", myJoinObjects);
  provide("postJoin", postJoin);
  provide("fetchChatTitle", fetchChatTitle);
  provide("closeSidebarOnMobile", onChatClick);

  return {
    isSidebarOpen,
    isJoinOpen,
    inviteId,
    isJoining,
    areMyChatsLoading,
    myChats,
    joinByInvite,
    onChatClick,
  };
}

const App = { template: "#template", setup };

createApp(App)
  .use(router)
  .use(GraffitiPlugin, {
    graffiti: new GraffitiDecentralized(),
  })
  .component("MessageBubble", MessageBubble)
  .mount("#app");
