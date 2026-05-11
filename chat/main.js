import { ref, computed, inject, watch, nextTick, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { chatItemSchema } from "../index.js";

export default function () {
  return {
    props: {
      chatId: { type: String, required: true },
    },
    template: `
      <header class="main-head">
        <h2>{{ activeTitle || 'Chat' }}</h2>
        <div class="spacer"></div>
        <button class="icon" @click="copyInvite" title="Copy invite ID">
          {{ justCopied ? 'Copied' : 'Invite' }}
        </button>
        <button
          class="icon"
          :class="{ on: isRecapOpen }"
          @click="isRecapOpen = !isRecapOpen"
          title="Highlights — important and shared content"
        >Highlights</button>
        <button
          class="icon danger"
          @click="leaveChat"
          :disabled="isLeaving"
          title="Leave chat"
        >{{ isLeaving ? 'Leaving…' : 'Leave' }}</button>
      </header>

      <div class="messages" ref="messagesEl">
        <p v-if="areMessagesLoading" class="muted centered">Loading messages…</p>
        <template v-else>
          <div v-if="sortedMessages.length === 0" class="empty">
            <p class="muted">No messages yet. Say hi.</p>
          </div>
          <transition-group name="msg" tag="div" class="msg-list">
            <message-bubble
              v-for="msg in sortedMessages"
              :key="msg.url"
              :msg="msg"
              :me="me"
              :is-starred="isStarred(msg.url)"
              :is-deleting="isDeleting.has(msg.url)"
              :readers="readersFor(msg.url)"
              :member-count="memberCount"
              @toggle-star="toggleStar"
              @delete="deleteMessage"
            ></message-bubble>
          </transition-group>
        </template>
      </div>

      <div v-if="isRecapOpen" class="recap" @click.stop>
        <header>
          <div>
            <h3>Highlights</h3>
            <p class="recap-subtitle">Important messages and shared links from this chat.</p>
          </div>
          <button class="icon" @click="isRecapOpen = false">×</button>
        </header>
        <div class="recap-tabs">
          <button
            :class="{ active: highlightsTab === 'important' }"
            @click="highlightsTab = 'important'"
          >★ Important <span class="count">{{ starredMessages.length }}</span></button>
          <button
            :class="{ active: highlightsTab === 'links' }"
            @click="highlightsTab = 'links'"
          >🔗 Links <span class="count">{{ linkMessages.length }}</span></button>
        </div>

        <template v-if="highlightsTab === 'important'">
          <div v-if="starredMessages.length === 0" class="empty">
            <p class="muted">Nothing marked important yet. Tap ★ next to a message.</p>
          </div>
          <ul v-else class="highlight-list">
            <li
              v-for="msg in starredMessages"
              :key="msg.url"
              class="jumpable"
              @click="jumpToMessage(msg.url)"
              :title="'Jump to message'"
            >
              <div class="meta">
                <graffiti-actor-to-handle :actor="msg.actor"></graffiti-actor-to-handle>
                <span class="time">{{ fmtTime(msg.value.published) }}</span>
              </div>
              <span class="content">{{ msg.value.content }}</span>
            </li>
          </ul>
        </template>

        <template v-else-if="highlightsTab === 'links'">
          <div v-if="linkMessages.length === 0" class="empty">
            <p class="muted">No links shared yet. Paste a URL into the chat.</p>
          </div>
          <ul v-else class="highlight-list">
            <li
              v-for="msg in linkMessages"
              :key="msg.url"
              class="jumpable"
              @click="jumpToMessage(msg.url)"
              :title="'Jump to message'"
            >
              <div class="meta">
                <graffiti-actor-to-handle :actor="msg.actor"></graffiti-actor-to-handle>
                <span class="time">{{ fmtTime(msg.value.published) }}</span>
              </div>
              <a
                v-for="(link, i) in extractLinks(msg.value.content)"
                :key="i"
                :href="link"
                target="_blank"
                rel="noopener noreferrer"
                class="link-url"
                @click.stop
              >{{ link }}</a>
            </li>
          </ul>
        </template>
      </div>

      <form class="composer" @submit.prevent="sendMessage">
        <button
          type="button"
          class="star-toggle"
          :class="{ on: isStarNext }"
          @click="isStarNext = !isStarNext"
          :title="isStarNext ? 'Important: on' : 'Mark as important'"
        >★<span class="lbl">{{ isStarNext ? 'Important' : '' }}</span></button>
        <input
          v-model="myMessage"
          type="text"
          placeholder="Message"
          :disabled="isSending"
        />
        <button type="submit" class="primary" :disabled="!myMessage.trim() || isSending">
          {{ isSending ? 'Sending…' : 'Send' }}
        </button>
      </form>
    `,
    setup(props) {
      const router = useRouter();
      const graffiti = useGraffiti();
      const session = useGraffitiSession();
      const myChats = inject("myChats");
      const myJoinObjects = inject("myJoinObjects");
      const fetchChatTitle = inject("fetchChatTitle");
      const postJoin = inject("postJoin");

      const channel = computed(() => decodeURIComponent(props.chatId));
      const me = computed(() => session.value?.actor || "");

      const messagesEl = ref(null);
      let isAtBottom = true;
      let hasInitialScrolled = false;
      function onScroll() {
        const el = messagesEl.value;
        if (!el) return;
        isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }
      function scrollToBottom() {
        const el = messagesEl.value;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        isAtBottom = true;
      }
      watch(messagesEl, (el, _, onCleanup) => {
        if (!el) return;
        el.addEventListener("scroll", onScroll, { passive: true });
        onCleanup(() => el.removeEventListener("scroll", onScroll));
      });
      onBeforeUnmount(() => {
        const el = messagesEl.value;
        if (el) el.removeEventListener("scroll", onScroll);
      });

      const myMessage = ref("");
      const isSending = ref(false);
      const isStarNext = ref(false);
      const isRecapOpen = ref(false);
      const isLeaving = ref(false);
      const justCopied = ref(false);
      const isDeleting = ref(new Set());
      const fetchedTitle = ref("");

      const { objects: chatItemObjects, isFirstPoll: areMessagesLoading } =
        useGraffitiDiscover(
          () => (channel.value ? [channel.value] : []),
          chatItemSchema,
          undefined,
          true,
        );

      const activeTitle = computed(() => {
        const ch = channel.value;
        const join = myChats.value.find((j) => j.value.target === ch);
        return join?.value?.title || fetchedTitle.value || "Chat";
      });

      const sortedMessages = computed(() =>
        chatItemObjects.value
          .filter((o) => o.value && typeof o.value.content === "string")
          .toSorted(
            (a, b) => (a.value.published || 0) - (b.value.published || 0),
          ),
      );

      const starObjects = computed(() => {
        const senderByUrl = new Map(
          sortedMessages.value.map((m) => [m.url, m.actor]),
        );
        return chatItemObjects.value.filter(
          (o) =>
            o.value &&
            o.value.activity === "Star" &&
            o.value.object &&
            memberActors.value.has(o.actor) &&
            senderByUrl.get(o.value.object) === o.actor,
        );
      });

      const starredUrls = computed(
        () => new Set(starObjects.value.map((s) => s.value.object)),
      );

      const starredMessages = computed(() =>
        sortedMessages.value.filter((m) => starredUrls.value.has(m.url)),
      );

      const linkRegex = /\bhttps?:\/\/[^\s<>"'`]+/gi;
      function extractLinks(content) {
        if (!content) return [];
        return content.match(linkRegex) || [];
      }
      const linkMessages = computed(() =>
        sortedMessages.value.filter(
          (m) => extractLinks(m.value.content).length > 0,
        ),
      );

      const highlightsTab = ref("important");

      function jumpToMessage(url) {
        const container = messagesEl.value;
        if (!container) return;
        const safe =
          typeof CSS !== "undefined" && CSS.escape
            ? CSS.escape(url)
            : url.replace(/"/g, '\\"');
        const el = container.querySelector(`[data-msg-url="${safe}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("flash");
        void el.offsetWidth;
        el.classList.add("flash");
        setTimeout(() => el.classList.remove("flash"), 1300);
      }

      const readObjects = computed(() =>
        chatItemObjects.value.filter(
          (o) => o.value && o.value.activity === "Read" && o.value.object,
        ),
      );

      const readsByMessage = computed(() => {
        const m = new Map();
        const members = memberActors.value;
        for (const r of readObjects.value) {
          if (!members.has(r.actor)) continue;
          const url = r.value.object;
          const t = r.value.published || 0;
          if (!m.has(url)) m.set(url, new Map());
          const inner = m.get(url);
          if (!inner.has(r.actor) || inner.get(r.actor) < t) {
            inner.set(r.actor, t);
          }
        }
        return m;
      });

      function readersFor(url) {
        const inner = readsByMessage.value.get(url);
        if (!inner) return [];
        return [...inner.entries()]
          .filter(([actor]) => actor !== me.value)
          .map(([actor, lastRead]) => ({ actor, lastRead }))
          .sort((a, b) => b.lastRead - a.lastRead);
      }

      const memberActors = computed(() => {
        const set = new Set();
        for (const o of chatItemObjects.value) {
          if (
            o.value &&
            o.value.activity === "Join" &&
            o.value.target === channel.value
          ) {
            set.add(o.actor);
          }
        }
        return set;
      });

      const memberCount = computed(() => memberActors.value.size);

      const inflightReads = new Set();

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

      async function copyInvite() {
        await navigator.clipboard.writeText(channel.value);
        justCopied.value = true;
        setTimeout(() => (justCopied.value = false), 1200);
      }

      async function leaveChat() {
        if (!confirm(`Leave "${activeTitle.value}"?`)) return;
        isLeaving.value = true;
        try {
          const ch = channel.value;
          const mineJoins = myJoinObjects.value.filter(
            (j) => j.value.target === ch,
          );
          const myReads = readObjects.value.filter(
            (r) => r.actor === me.value,
          );
          await Promise.all([
            ...mineJoins.map((j) => graffiti.delete(j, session.value)),
            ...myReads.map((r) => graffiti.delete(r, session.value)),
          ]);
          router.push("/");
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
              channels: [channel.value],
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
                channels: [channel.value],
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
        if (msg.actor !== session.value?.actor) return;
        const mine = myStarsFor(msg.url);
        if (mine.length) {
          await Promise.all(
            mine.map((s) => graffiti.delete(s, session.value)),
          );
        } else {
          await graffiti.post(
            {
              value: {
                activity: "Star",
                object: msg.url,
                published: Date.now(),
              },
              channels: [channel.value],
            },
            session.value,
          );
        }
      }

      watch(
        () => sortedMessages.value.length,
        async (newLen, oldLen) => {
          if (newLen === 0) return;
          await nextTick();
          if (!hasInitialScrolled) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                scrollToBottom();
                hasInitialScrolled = true;
              });
            });
            return;
          }
          if (newLen > (oldLen || 0) && isAtBottom) {
            scrollToBottom();
          }
        },
        { immediate: true },
      );

      watch(channel, () => {
        hasInitialScrolled = false;
        isAtBottom = true;
      });

      const autoJoinedChannels = new Set();

      watch(
        channel,
        async (ch) => {
          if (!ch) return;
          isRecapOpen.value = false;
          fetchedTitle.value = "";
          const known = myChats.value.find((j) => j.value.target === ch);
          if (!known) {
            const t = await fetchChatTitle(ch);
            fetchedTitle.value = t;
            if (!autoJoinedChannels.has(ch)) {
              autoJoinedChannels.add(ch);
              try {
                await postJoin(ch, t);
              } catch {
                autoJoinedChannels.delete(ch);
              }
            }
          }
        },
        { immediate: true },
      );

      watch(
        sortedMessages,
        (msgs) => {
          const me = session.value?.actor;
          if (!me || !channel.value) return;
          for (const msg of msgs) {
            if (msg.actor === me) continue;
            const readers = readsByMessage.value.get(msg.url);
            if (readers && readers.has(me)) continue;
            if (inflightReads.has(msg.url)) continue;
            inflightReads.add(msg.url);
            graffiti
              .post(
                {
                  value: {
                    activity: "Read",
                    object: msg.url,
                    published: Date.now(),
                  },
                  channels: [channel.value],
                },
                session.value,
              )
              .catch(() => {})
              .finally(() => inflightReads.delete(msg.url));
          }
        },
        { immediate: true },
      );

      return {
        session,
        me,
        messagesEl,
        myMessage,
        isSending,
        isStarNext,
        isRecapOpen,
        isLeaving,
        justCopied,
        isDeleting,
        areMessagesLoading,
        activeTitle,
        sortedMessages,
        starredMessages,
        linkMessages,
        extractLinks,
        highlightsTab,
        jumpToMessage,
        isStarred,
        readersFor,
        memberCount,
        fmtTime,
        copyInvite,
        leaveChat,
        sendMessage,
        deleteMessage,
        toggleStar,
      };
    },
  };
}
