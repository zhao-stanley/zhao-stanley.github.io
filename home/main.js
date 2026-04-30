export default function () {
  return {
    template: `
      <header class="main-head">
        <h2>Pick a chat</h2>
      </header>
      <div class="empty">
        <p class="muted">
          Open a chat from the sidebar, start a
          <router-link to="/newchat">new one</router-link>,
          or read the <router-link to="/about">about page</router-link>.
        </p>
      </div>
    `,
  };
}
