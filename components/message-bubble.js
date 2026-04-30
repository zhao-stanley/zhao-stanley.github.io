import { computed, ref } from "vue";

export const MessageBubble = {
  props: {
    msg: { type: Object, required: true },
    me: { type: String, default: "" },
    isStarred: { type: Boolean, default: false },
    isDeleting: { type: Boolean, default: false },
    readers: { type: Array, default: () => [] },
    memberCount: { type: Number, default: 0 },
  },
  emits: ["toggle-star", "delete"],
  setup(props) {
    const isMine = computed(() => props.msg.actor === props.me);
    const isSeenOpen = ref(false);
    const denominator = computed(() => Math.max(props.memberCount - 1, 0));

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

    function fmtFullTime(ts) {
      if (!ts) return "";
      const d = new Date(ts);
      return d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    return {
      isMine,
      isSeenOpen,
      denominator,
      fmtTime,
      fmtFullTime,
    };
  },
  template: `
    <div :class="['msg', isMine ? 'mine' : 'theirs', { starred: isStarred }]">
      <div class="msg-meta">
        <graffiti-actor-to-handle :actor="msg.actor"></graffiti-actor-to-handle>
        <span class="time">{{ fmtTime(msg.value.published) }}</span>
      </div>
      <div class="bubble">
        <span class="content">{{ msg.value.content }}</span>
        <div class="actions">
          <button
            class="star"
            :class="{ on: isStarred }"
            @click="$emit('toggle-star', msg)"
            :title="isStarred ? 'Unmark important' : 'Mark important'"
          >★</button>
          <button
            v-if="isMine"
            class="unsend"
            @click="$emit('delete', msg)"
            :disabled="isDeleting"
            title="Unsend"
          >{{ isDeleting ? 'unsending…' : 'unsend' }}</button>
        </div>
      </div>
      <div v-if="isMine && denominator > 0" class="seen">
        <button
          v-if="readers.length"
          class="seen-toggle"
          @click="isSeenOpen = true"
        >✓✓ Seen by {{ readers.length }}/{{ denominator }}</button>
        <span v-else class="seen-sent">✓ Sent</span>
      </div>

      <teleport to="body">
        <div
          v-if="isSeenOpen"
          class="modal-backdrop"
          @click.self="isSeenOpen = false"
        >
          <div class="modal seen-modal">
            <h3>Seen by</h3>
            <p class="muted seen-stats">
              {{ readers.length }}/{{ denominator }} members
            </p>
            <ul class="seen-list">
              <li v-for="r in readers" :key="r.actor">
                <graffiti-actor-to-handle :actor="r.actor"></graffiti-actor-to-handle>
                <span class="time">{{ fmtFullTime(r.lastRead) }}</span>
              </li>
            </ul>
            <div class="row">
              <button class="secondary" @click="isSeenOpen = false">Close</button>
            </div>
          </div>
        </div>
      </teleport>
    </div>
  `,
};
