import { ref, inject } from "vue";
import { useRouter } from "vue-router";
import { useGraffiti, useGraffitiSession } from "@graffiti-garden/wrapper-vue";

export default function () {
  return {
    template: `
      <header class="main-head">
        <h2>New chat</h2>
      </header>
      <div class="empty">
        <form class="form-card" @submit.prevent="createChat">
          <h3>Create a new chat</h3>
          <input
            v-model="newTitle"
            type="text"
            placeholder="Chat title"
            required
            autofocus
          />
          <div class="row">
            <router-link to="/" class="secondary">Cancel</router-link>
            <button
              type="submit"
              class="primary"
              :disabled="!newTitle.trim() || isCreating"
            >
              {{ isCreating ? 'Creating…' : 'Create & Join' }}
            </button>
          </div>
        </form>
      </div>
    `,
    setup() {
      const router = useRouter();
      const graffiti = useGraffiti();
      const session = useGraffitiSession();
      const postJoin = inject("postJoin");

      const newTitle = ref("");
      const isCreating = ref(false);

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
          newTitle.value = "";
          router.push(`/chat/${encodeURIComponent(channel)}`);
        } finally {
          isCreating.value = false;
        }
      }

      return { newTitle, isCreating, createChat };
    },
  };
}
