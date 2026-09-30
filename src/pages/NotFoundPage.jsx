import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <main className="not-found">
      <p className="eyebrow">404</p>
      <h2>Không tìm thấy trang này</h2>
      {/* <p>The route you requested does not exist yet.</p> */}
      <Link className="primary-action home-link" to="/">
        Trở về trang chủ
      </Link>
    </main>
  )
}

export default NotFoundPage
