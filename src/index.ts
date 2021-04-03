import {
  Kaito,
  Controller,
  Get,
  Post,
  Schema,
  KTX,
  KRT,
} from "@kaito-http/core";
import fetch from "node-fetch";
import dotenv from "dotenv";
import redis from "redis";
import { promisify } from "util";
import Color from "color";

dotenv.config();
const client = redis.createClient({ port: 56379 });

client.on("error", function (error) {
  console.error(error);
});

const setAsync = promisify(client.set).bind(client);
const getAsync = promisify(client.get).bind(client);
const setexAsync = promisify(client.setex).bind(client);

// client.del("refresh_token");
// client.del("access_token");

type CurrentSongType = {
  id: string;
  name: string;
  artist: string;
  href: string;
} | null;

type SectionType = {
  confidence: number;
  duration: number;
  key: number;
  key_confidence: number;
  loudness: number;
  mode: number;
  mode_confidence: number;
  start: number;
  tempo: number;
  tempo_confidence: number;
  time_signature: number;
  time_signature_confidence: number;
};

const headers = {
  "Content-Type": "application/x-www-form-urlencoded",
  Authorization:
    "Basic " +
    Buffer.from(
      `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
    ).toString("base64"),
};

@Controller("/spotify")
class Home {
  @Get("/")
  async home(): KRT<{
    success: boolean;
    message: { song: CurrentSongType; gradient: any } | string;
  }> {
    const accessToken = await getAcessToken();
    if (!!accessToken) {
      const details = await getGradient(accessToken);
      return {
        body: {
          success: !!details,
          message: details
            ? { song: details.song, gradient: details.gradient }
            : "An unexpected error occured",
        },
      };
    }
  }
}

const getGradient: (
  token: string
) => Promise<{ song: CurrentSongType; gradient: any } | null> = async (
  token
) => {
  const currentSong = await getCurrentSong(token);
  if (currentSong) {
    const gradient = await calculateGradient(token, currentSong.id);
    return {
      song: currentSong,
      gradient: gradient,
    };
  } else {
    return null;
  }
};

const calculateGradient = async (token: string, id: string) => {
  const audioFeatures = await getAudioFeatures(token, id);
  if (audioFeatures) {
    const gradientArray = audioFeatures.sections.map((section: SectionType) => {
      const hue = (section.tempo / 200) * 360;
      const saturation =
        (section.loudness / -60) * 100 >= 100
          ? 100
          : (section.loudness / -60) * 100;
      const lightness = (section.key / 11) * 100;
      return {
        color: Color.hsl(hue, saturation, lightness).hex(),
        length: (
          (section.duration / audioFeatures.track.duration) *
          100
        ).toFixed(2),
      };
    });
    return gradientArray;
  }
};

const getAudioFeatures = async (token: string, id: string) => {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/audio-analysis/${id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    ).then((res) => res.json());
    if (!response.sections) {
      throw new Error("Response does not contain sections");
    }
    return response;
  } catch (e) {
    console.log(e);
    return false;
  }
};

const getCurrentSong = async (token: string) => {
  try {
    const response = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing?market=GB",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    ).then((res) => res.json());
    return {
      id: response.item.id,
      name: response.item.name,
      artist: response.item.artists[0].name,
      href: response.item.href,
    };
  } catch (e) {
    console.log(e);
    return false;
  }
};

const getAcessToken = async () => {
  const redisAccessToken = await getAsync("access_token");
  const redisRefreshToken = await getAsync("refresh_token");

  if (redisAccessToken) {
    return redisAccessToken;
  } else if (redisRefreshToken) {
    try {
      const response = await refreshTokenRequest(
        redisRefreshToken
      ).then((res) => res.json());
      await setTokens(response);
      return response.access_token || response;
    } catch (e) {
      console.log(e);
      return false;
    }
  } else {
    try {
      const response = await noTokensRequest().then((res) => res.json());
      console.log(response);
      await setTokens(response);
      return response.access_token;
    } catch (e) {
      console.log(e);
      return false;
    }
  }
};

const setTokens = async (res: any) => {
  if (res.access_token && res.refresh_token) {
    await setexAsync("access_token", 3600, res.access_token);
    await setAsync("refresh_token", res.refresh_token);
  }
};

const noTokensRequest = () => {
  return fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: process.env.CODE || "",
      redirect_uri: "https://wyattsell.com",
    }),
    headers: headers,
  });
};

const refreshTokenRequest = (refresh_token: string) => {
  return fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    body: `grant_type=refresh_token&refresh_token=${refresh_token}`,
    headers: headers,
  });
};

const app = new Kaito({
  controllers: [new Home()],
  logging: true,
}).listen(8080);
