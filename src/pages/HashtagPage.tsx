import { useParams } from "react-router-dom";
import SearchResults from "./SearchResults";

// This component redirects hashtag URLs to the search results page
export default function HashtagPage() {
  const { hashtag } = useParams<{ hashtag: string }>();
  
  // Redirect to search results with hashtag query
  if (typeof window !== 'undefined' && hashtag) {
    window.location.href = `/zoeken?q=%23${hashtag}`;
  }
  
  return null;
}
