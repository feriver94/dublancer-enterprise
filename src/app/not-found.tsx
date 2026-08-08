import Link from "next/link";

export default function NotFound() {
  return <main className="profile-loading"><div><h1>404</h1><p>This public profile is unavailable or private.</p><Link href="/">Return to Dublancer</Link></div></main>;
}
