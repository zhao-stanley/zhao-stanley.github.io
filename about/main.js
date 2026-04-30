export default function () {
  return {
    template: `
      <header class="main-head">
        <h2>About</h2>
      </header>
      <div class="empty">
        <div class="about-content">
          <h3>Decentralized Chat</h3>
          <p>A simple chat app built on Graffiti, with full client-side rendering.</p>
          <ul>
            <li>Create chats or join by invite ID</li>
            <li>Mark important messages and recap them</li>
            <li>Unsend your own messages</li>
          </ul>
          <p class="muted">Routes:
            <code>/</code>,
            <code>/chat/:chatId</code>,
            <code>/newchat</code>,
            <code>/about</code>
          </p>
          <router-link class="primary" to="/">Back to chats</router-link>
        </div>
      </div>
    `,
  };
}
