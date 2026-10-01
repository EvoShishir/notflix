import {
  APICategory,
  APIPost,
  APIResponse,
  CategoriesAPIResponse,
  Category,
  CategoryAPIItem,
  CategoryPostAPIResponse,
  CategoryPostsAPIResponse,
  IndividualPostAPIResponse,
  Movie,
  SearchAPIPost,
  SearchAPIResponse,
  TVShow,
  Video,
  VideoType,
} from "@/types";

const API_BASE_URL = "http://new.circleftp.net:5000";
const IMAGE_BASE_URL = `${API_BASE_URL}/uploads/`;

class ApiService {
  async fetchHomepageData(): Promise<APIResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/home-page/getHomePagePosts`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: APIResponse = await response.json();
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Convert API post to our app's video format
  convertAPIPostToVideo(post: APIPost): VideoType {
    const baseVideo = {
      id: post.id.toString(),
      title: post.title || post.name,
      description: `${post.quality} • ${post.year}`,
      poster: `${IMAGE_BASE_URL}${post.image}`,
      backdrop: `${IMAGE_BASE_URL}${post.image}`,
      duration: this.parseWatchTime(post.watchTime),
      releaseYear: parseInt(post.year) || new Date().getFullYear(),
      genres: this.extractGenresFromQuality(post.quality),
      rating: 8.0, // Default rating since not provided by API
      videoUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", // Placeholder
      quality: post.quality,
      watchTime: post.watchTime,
      subtitles: this.extractSubtitlesFromMetadata("", post.quality),
      audioTracks: this.extractAudioTracksFromMetadata("", post.quality),
    };

    if (post.type === "series") {
      return {
        ...baseVideo,
        type: "tv",
        seasons: [
          {
            seasonNumber: 1,
            episodes: [
              {
                ...baseVideo,
                seasonNumber: 1,
                episodeNumber: 1,
                title: "Episode 1",
              },
            ],
          },
        ],
        totalEpisodes: 10, // Default episode count
      } as TVShow;
    }

    return {
      ...baseVideo,
      type: "movie",
    } as Movie;
  }

  // Convert API category to our app's category format
  convertAPICategory(apiCategory: APICategory): Category {
    return {
      id: apiCategory.id.toString(),
      name: apiCategory.name,
      videos: apiCategory.posts.map((post) => this.convertAPIPostToVideo(post)),
    };
  }

  // Parse watch time string to minutes
  private parseWatchTime(watchTime: string): number {
    if (!watchTime) return 0;

    // Handle formats like "1h 54m", "2h 50m", "1h", "45m"
    const hourMatch = watchTime.match(/(\d+)h/);
    const minuteMatch = watchTime.match(/(\d+)m/);

    const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
    const minutes = minuteMatch ? parseInt(minuteMatch[1]) : 0;

    return hours * 60 + minutes;
  }

  // Extract audio tracks from video metadata
  private extractAudioTracksFromMetadata(
    videoUrl: string,
    quality?: string
  ): any[] {
    const audioTracks = [];

    // Extract from quality string
    if (quality) {
      const qualityLower = quality.toLowerCase();

      // Check for dual audio indicators
      if (
        qualityLower.includes("dual audio") ||
        qualityLower.includes("hin+eng")
      ) {
        audioTracks.push(
          { id: "1", language: "en", url: "", label: "English" },
          { id: "2", language: "hi", url: "", label: "Hindi" }
        );
      } else if (qualityLower.includes("hindi")) {
        audioTracks.push({ id: "1", language: "hi", url: "", label: "Hindi" });
      } else if (
        qualityLower.includes("spanish") ||
        qualityLower.includes("esp")
      ) {
        audioTracks.push({
          id: "1",
          language: "es",
          url: "",
          label: "Spanish",
        });
      } else if (
        qualityLower.includes("french") ||
        qualityLower.includes("fr")
      ) {
        audioTracks.push({ id: "1", language: "fr", url: "", label: "French" });
      } else {
        audioTracks.push({
          id: "1",
          language: "en",
          url: "",
          label: "English",
        });
      }

      // Check for audio format indicators
      if (qualityLower.includes("5.1") || qualityLower.includes("surround")) {
        audioTracks[0].label += " 5.1";
      } else if (qualityLower.includes("7.1")) {
        audioTracks[0].label += " 7.1";
      } else if (qualityLower.includes("atmos")) {
        audioTracks[0].label += " Atmos";
      }
    } else {
      // Default English track
      audioTracks.push({ id: "1", language: "en", url: "", label: "English" });
    }

    // Extract from filename
    if (videoUrl) {
      const filename = videoUrl.toLowerCase();

      if (
        filename.includes("dual") &&
        !audioTracks.some((t) => t.language === "hi")
      ) {
        audioTracks.push({
          id: (audioTracks.length + 1).toString(),
          language: "hi",
          url: "",
          label: "Hindi",
        });
      }

      if (filename.includes("multi") && audioTracks.length === 1) {
        audioTracks.push(
          { id: "2", language: "es", url: "", label: "Spanish" },
          { id: "3", language: "fr", url: "", label: "French" }
        );
      }
    }

    return audioTracks;
  }

  // Extract subtitles from video metadata
  private extractSubtitlesFromMetadata(
    videoUrl: string,
    quality?: string
  ): any[] {
    const subtitles = [];

    // Extract from quality string
    if (quality) {
      const qualityLower = quality.toLowerCase();

      // Check for subtitle indicators
      if (
        qualityLower.includes("dual audio") ||
        qualityLower.includes("hin+eng")
      ) {
        subtitles.push(
          { id: "1", language: "en", url: "", label: "English" },
          { id: "2", language: "hi", url: "", label: "Hindi" }
        );
      } else if (
        qualityLower.includes("subtitle") ||
        qualityLower.includes("sub")
      ) {
        subtitles.push({ id: "1", language: "en", url: "", label: "English" });
      }
    }

    // Extract from filename
    if (videoUrl) {
      const filename = videoUrl.toLowerCase();

      if (filename.includes(".srt") || filename.includes("subtitle")) {
        if (!subtitles.some((s) => s.language === "en")) {
          subtitles.push({
            id: (subtitles.length + 1).toString(),
            language: "en",
            url: "",
            label: "English",
          });
        }
      }

      if (filename.includes("dual") || filename.includes("multi")) {
        if (!subtitles.some((s) => s.language === "en")) {
          subtitles.push({
            id: "1",
            language: "en",
            url: "",
            label: "English",
          });
        }
        if (!subtitles.some((s) => s.language === "hi")) {
          subtitles.push({
            id: (subtitles.length + 1).toString(),
            language: "hi",
            url: "",
            label: "Hindi",
          });
        }
      }
    }

    // Always provide at least English subtitles
    if (subtitles.length === 0) {
      subtitles.push({ id: "1", language: "en", url: "", label: "English" });
    }

    return subtitles;
  }

  // Extract genres from quality string
  private extractGenresFromQuality(quality: string): string[] {
    const genres: string[] = [];

    if (quality && quality.toLowerCase().includes("anime"))
      genres.push("Animation");
    if (quality && quality.toLowerCase().includes("hindi"))
      genres.push("Bollywood");
    if (quality && quality.toLowerCase().includes("english"))
      genres.push("Hollywood");
    if (quality && quality.toLowerCase().includes("tv series"))
      genres.push("TV Show");
    if (quality && quality.toLowerCase().includes("documentary"))
      genres.push("Documentary");
    if (quality && quality.toLowerCase().includes("dub")) genres.push("Dubbed");

    // Default genre if none found
    if (genres.length === 0) {
      genres.push("Entertainment");
    }

    return genres;
  }

  // Create trending category from latest posts
  createTrendingCategory(latestPosts: APIPost[]): Category {
    return {
      id: "trending",
      name: "Trending Now",
      videos: latestPosts
        .slice(0, 6)
        .map((post) => this.convertAPIPostToVideo(post)),
    };
  }

  // Create recently added category from latest posts
  createRecentlyAddedCategory(latestPosts: APIPost[]): Category {
    return {
      id: "recently-added",
      name: "Recently Added",
      videos: latestPosts
        .slice(0, 8)
        .map((post) => this.convertAPIPostToVideo(post)),
    };
  }

  async searchPosts(
    searchTerm: string,
    page: number = 1,
    limit: number = 50
  ): Promise<SearchAPIResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/posts?searchTerm=${encodeURIComponent(
          searchTerm
        )}&page=${page}&limit=${limit}&order=desc`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: SearchAPIResponse = await response.json();
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Always returns a discriminated Movie | TVShow (see the branches below),
  // so the annotation is VideoType rather than the base Video.
  convertSearchAPIPostToVideo(post: SearchAPIPost): VideoType {
    const isSeries = post.type === "series";
    const genres = this.extractGenresFromQuality(post.quality || "");
    const description = post.metaData || post.title || post.name;

    const video: Video = {
      id: post.id.toString(),
      title: post.name,
      description: description,
      poster: `${IMAGE_BASE_URL}${post.imageSm}`,
      backdrop: `${IMAGE_BASE_URL}${post.image}`,
      duration: this.parseWatchTime(post.watchTime),
      releaseYear: parseInt(post.year || "2000"),
      genres: genres.length > 0 ? genres : ["General"],
      rating: 8.0, // Default rating since not provided by API
      videoUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", // Placeholder
      quality: post.quality,
      watchTime: post.watchTime,
      subtitles: [{ id: "1", language: "en", url: "", label: "English" }],
      audioTracks: [{ id: "1", language: "en", url: "", label: "English 5.1" }],
    };

    if (isSeries) {
      return {
        ...video,
        type: "tv",
        seasons: [
          {
            seasonNumber: 1,
            episodes: [
              {
                ...video,
                seasonNumber: 1,
                episodeNumber: 1,
                title: `${post.name} - Episode 1`,
                description: `${description} - Episode 1`,
              },
            ],
          },
        ],
        totalEpisodes: 10, // Default episode count
      } as TVShow;
    } else {
      return { ...video, type: "movie" } as Movie;
    }
  }

  async fetchCategories(): Promise<CategoriesAPIResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/categories`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: CategoriesAPIResponse = await response.json();
      return data;
    } catch (error) {
      throw error;
    }
  }

  convertCategoryAPIItemToCategory(apiCategory: CategoryAPIItem): Category {
    return {
      id: apiCategory.id.toString(),
      name: apiCategory.name,
      videos: [], // Will be populated when fetching category content
    };
  }

  async fetchCategoryPosts(
    categoryId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<CategoryPostAPIResponse> {
    try {
      const url = `${API_BASE_URL}/api/posts?categoryExact=${categoryId}&page=${page}&order=desc&limit=${limit}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: CategoryPostsAPIResponse = await response.json();

      // Handle different response formats
      if (Array.isArray(data)) {
        // API returned posts directly as an array
        return { posts: data };
      } else if (data && typeof data === "object" && "posts" in data) {
        // API returned object with posts property
        return data as CategoryPostAPIResponse;
      } else {
        // Unexpected format
        return { posts: [] };
      }
    } catch (error) {
      throw error;
    }
  }

  async fetchIndividualPost(
    postId: string
  ): Promise<IndividualPostAPIResponse> {
    try {
      const url = `${API_BASE_URL}/api/posts/${postId}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: IndividualPostAPIResponse = await response.json();
      return data;
    } catch (error) {
      throw error;
    }
  }

  convertIndividualPostToVideo(post: IndividualPostAPIResponse): VideoType {
    const isSeries = post.type === "series";
    const genres = this.extractGenresFromQuality(post.quality || "");
    const description = post.metaData || post.title || post.name;

    const baseVideo: Video = {
      id: post.id.toString(),
      title: post.name,
      description: description,
      poster: `${IMAGE_BASE_URL}${post.imageSm}`,
      backdrop: `${IMAGE_BASE_URL}${post.image}`,
      duration: this.parseWatchTime(post.watchTime),
      releaseYear: parseInt(post.year || "2000"),
      genres: genres.length > 0 ? genres : ["General"],
      rating: 8.0, // Default rating since not provided by API
      videoUrl: typeof post.content === "string" ? post.content : "", // Handle both string and array
      quality: post.quality,
      watchTime: post.watchTime,
      subtitles: this.extractSubtitlesFromMetadata(
        typeof post.content === "string" ? post.content : "",
        post.quality
      ),
      audioTracks: this.extractAudioTracksFromMetadata(
        typeof post.content === "string" ? post.content : "",
        post.quality
      ),
    };

    if (isSeries && Array.isArray(post.content)) {
      // Convert TV show content structure
      const seasons = post.content
        .filter((season) => season.seasonName && season.episodes.length > 0)
        .map((season, seasonIndex) => ({
          seasonNumber: seasonIndex + 1,
          episodes: season.episodes.map((episode, episodeIndex) => ({
            ...baseVideo,
            id: `${post.id}-s${seasonIndex + 1}-e${episodeIndex + 1}`,
            title: episode.title,
            videoUrl: episode.link,
            seasonNumber: seasonIndex + 1,
            episodeNumber: episodeIndex + 1,
            subtitles: this.extractSubtitlesFromMetadata(
              episode.link,
              post.quality
            ),
            audioTracks: this.extractAudioTracksFromMetadata(
              episode.link,
              post.quality
            ),
          })),
        }));

      const totalEpisodes = seasons.reduce(
        (total, season) => total + season.episodes.length,
        0
      );

      const tvShow = {
        ...baseVideo,
        type: "tv",
        seasons,
        totalEpisodes,
      } as TVShow;

      return tvShow;
    } else {
      // Single video (movie or single episode)
      return { ...baseVideo, type: "movie" } as Movie;
    }
  }
}

export const apiService = new ApiService();
export default apiService;
