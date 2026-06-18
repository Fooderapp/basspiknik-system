"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import type { Venue } from "@/lib/venue";
import type { Dictionary } from "@/lib/i18n";

// OpenFreeMap Positron — free vector tiles, no API key, same clean aesthetic
// as Mapbox Light. See https://openfreemap.org for terms.
const POSITRON_STYLE = "https://tiles.openfreemap.org/styles/positron";

export function VenueMap({
  venues,
  dict,
  lang,
  fly,
}: {
  venues: Venue[];
  dict: Dictionary;
  lang: "en" | "hu";
  /** When true, animate the zoom from country level down to the city. */
  fly: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinElsRef = useRef<(HTMLElement | null)[]>([]);
  const flownRef = useRef(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const imgIdxRef = useRef(0);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [activeVenue, setActiveVenue] = useState<Venue | null>(null);
  const [imgIndex, setImgIndex] = useState(0);

  // keep ref in sync so interval closure always sees current index
  useEffect(() => { imgIdxRef.current = imgIndex; }, [imgIndex]);

  // scroll carousel to slide 0 whenever a new venue opens
  useEffect(() => {
    if (!activeVenue) return;
    carouselRef.current?.scrollTo({ left: 0, behavior: "instant" });
  }, [activeVenue]);

  // auto-advance every 3 s when there are multiple images
  useEffect(() => {
    if (!activeVenue || activeVenue.images.length <= 1) return;
    const id = setInterval(() => {
      const next = (imgIdxRef.current + 1) % activeVenue.images.length;
      carouselRef.current?.scrollTo({ left: next * (carouselRef.current.clientWidth || 1), behavior: "smooth" });
    }, 3000);
    return () => clearInterval(id);
  }, [activeVenue]);

  const primary = venues[0];

  // Mount the map once — add a marker for every venue
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !primary) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: POSITRON_STYLE,
      center: [primary.lng, primary.lat],
      zoom: 4.4,
      interactive: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.once("load", () => setMapLoaded(true));

    venues.forEach((venue, idx) => {
      // MapLibre owns `wrapper`'s transform for positioning — never touch it.
      // Animate `inner` instead so the spring bounce doesn't override positioning.
      const PILL_H = 26;
      const PIN_W = 72;
      const PIN_H = 86;
      // The default SVG tip is at y≈57.7 in a 75-unit viewBox; shadow extends to 74.8.
      // anchor:"bottom" places element-bottom at the coordinate, but the visual tip
      // is ~23% above the element bottom. Shift element down by that gap so tip = coordinate.
      const PIN_TIP_OFFSET = Math.round((1 - 57.7 / 75) * PIN_H); // ≈20px

      const wrapper = document.createElement("div");
      wrapper.style.cssText = `position:relative;width:${PIN_W}px;height:${PIN_H + PILL_H + 4}px;`;

      const inner = document.createElement("div");
      inner.style.cssText = `opacity:0;transform:translateY(20px) scale(0.4);position:relative;width:${PIN_W}px;height:${PIN_H + PILL_H + 4}px;display:flex;flex-direction:column;align-items:center;`;
      pinElsRef.current[idx] = inner;

      // pill label above the pin
      const pill = document.createElement("div");
      pill.textContent = dict["location.click_pin"];
      pill.style.cssText = [
        "background:rgba(255,255,255,0.92);",
        "color:#16170F;",
        "font-size:11px;font-weight:700;letter-spacing:0.02em;",
        "padding:3px 10px;border-radius:999px;",
        "white-space:nowrap;margin-bottom:4px;",
        "box-shadow:0 2px 8px rgba(0,0,0,0.18);",
        "pointer-events:none;",
      ].join("");
      inner.appendChild(pill);

      const btn = document.createElement("button");
      btn.setAttribute("aria-label", venue.name);
      btn.style.cssText = "border:0;background:transparent;cursor:pointer;padding:0;display:block;animation:pinBob 2.2s ease-in-out 1.2s infinite;transform-origin:bottom center;";
      btn.innerHTML = venue.pinSvg ?? `<svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 63 75" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_d_185_69)">
<path d="M32.2165 8.9005C36.3398 8.9324 40.4117 10.4594 43.9294 13.6534C45.1646 14.7699 46.2031 16.0501 47.0534 17.4376C49.9212 22.1349 50.5393 28.1245 49.28 34.1935C48.0366 40.1908 44.948 46.2842 40.3796 51.2687V51.2804C38.1375 53.7247 35.5263 55.9142 32.5944 57.6847C32.2334 57.9479 31.7436 57.9799 31.3425 57.7247C27.0106 54.9852 23.3722 51.6951 20.5124 48.1183C16.5658 43.1978 14.0835 37.7428 13.2331 32.4874C12.3667 27.16 13.1771 22.0314 15.8444 17.8644C16.8953 16.2176 18.2383 14.7179 19.8747 13.422C23.6369 10.4433 27.9329 8.8687 32.2165 8.9005Z" fill="#FFF000"/>
</g>
<path d="M34.783 28.4645C34.5732 27.5881 33.8361 27.1836 33.0324 26.9303C30.1293 26.015 25.8808 26.0164 23.1205 27.3189L23.072 27.2893C23.0672 27.1874 23.1123 27.0692 23.1534 26.9759C25.7505 21.0697 32.1241 17.8883 38.0496 16.2919C38.5948 16.145 39.1528 16.0508 39.6941 15.9L39.6993 22.7822C39.6994 24.5003 39.7161 26.2521 39.6927 27.9678C38.7575 27.311 38.5036 27.1569 37.3866 26.7623C37.2926 26.4818 37.4256 26.1319 37.0578 26.1715C36.9841 26.2254 36.9357 26.3931 36.8487 26.514C36.6691 26.6308 36.1254 26.4207 35.8841 26.3749C34.6274 26.1361 33.0567 25.8637 31.7817 25.8882C31.3045 25.8688 30.6939 25.8266 30.2277 25.8837C30.5783 25.9292 31.6218 26.0008 31.8446 26.0614C33.3748 26.3431 36.5234 26.8224 36.925 28.6342C36.6602 29.4351 36.2054 29.8538 35.4402 30.2065C33.3798 31.1563 30.6381 31.4656 28.3855 31.4408C26.8495 31.4239 24.5016 31.1362 23.0726 30.6491C23.0554 30.2755 22.9367 28.0902 23.123 27.8913C23.2595 27.7456 23.5078 27.6733 23.6913 27.6054C24.9866 27.126 26.5681 26.9583 27.9476 26.9961C29.1629 27.0294 31.786 27.2908 32.6237 28.1974C32.7671 28.3525 32.8502 28.5384 32.8377 28.7521C32.8247 28.9752 32.6693 29.1608 32.507 29.3004C31.8406 29.8739 30.9845 29.9625 30.1806 30.214C29.4171 30.3186 28.6494 30.3896 27.8797 30.427L27.8748 30.4661C28.6207 30.5299 29.3288 30.4423 30.0735 30.3995C30.2983 30.3867 30.4587 30.337 30.714 30.3297C31.0537 30.3816 32.8814 29.9351 33.2625 29.7531C33.9972 29.4021 34.4556 29.2215 34.783 28.4645ZM37.2267 25.9881C37.5502 26.0412 38.0318 25.8504 38.2774 25.6716C38.6872 25.3823 38.9816 24.7699 39.0279 24.2703C39.24 21.9814 39.1107 19.5689 37.4409 17.802C37.3554 17.7115 37.1931 17.4924 37.0615 17.4896C35.7659 18.678 35.154 20.3526 35.1071 22.0814C35.068 23.5221 34.8233 25.8999 36.8673 25.9789C36.9871 25.9831 37.1069 25.9862 37.2267 25.9881ZM33.0943 25.5127C34.0698 25.5415 34.3523 24.3261 34.3325 23.5603C34.3012 22.3441 34.2053 21.1098 33.3768 20.1429C33.2583 20.0046 33.0915 19.7109 32.9156 19.6986C31.7375 20.936 31.5455 22.132 31.5954 23.7799C31.6302 24.9285 31.8812 25.454 33.0943 25.5127ZM29.8521 25.3722C30.643 25.391 30.794 24.8092 30.8087 24.1422C30.8331 23.0376 30.6998 22.0857 29.8959 21.2588C29.8822 21.2439 29.864 21.2351 29.8468 21.2256C29.3219 21.7853 29.022 22.3003 28.9361 23.0778C28.8556 23.8066 28.7922 24.4622 29.1126 25.1422C29.3667 25.328 29.5349 25.368 29.8521 25.3722Z" fill="black"/>
<path d="M26.7461 30.4046C27.1527 30.3918 27.4759 30.4125 27.8798 30.427L27.8749 30.4661C27.5486 30.4865 27.0657 30.4638 26.7461 30.4046Z" fill="black"/>
<path d="M27.0333 27.2608C28.2324 27.1654 31.0483 27.3319 31.7981 28.1226C33.0976 29.4932 28.9989 29.9084 28.4818 29.9153C27.021 29.9874 25.0564 29.9275 23.7986 29.0985C23.2677 28.6834 23.5345 28.1699 24.0323 27.9173C25.0044 27.4238 25.9646 27.3266 27.0333 27.2608Z" fill="#FFF000"/>
<path d="M24.4398 33.7235C25.5955 33.6287 26.6084 34.4906 26.6999 35.6466C26.7914 36.8026 25.9266 37.813 24.7703 37.9011C23.6188 37.9889 22.6133 37.1284 22.5223 35.9771C22.4312 34.8258 23.2888 33.8179 24.4398 33.7235ZM24.7531 36.9251C26.0541 36.4787 25.6302 34.6352 24.5413 34.7213C24.4747 34.739 24.2444 34.7972 24.1991 34.8275C23.2984 35.4301 23.5609 36.9211 24.7531 36.9251Z" fill="black"/>
<path d="M36.7918 33.7185C37.9909 33.7254 40.1542 33.3969 40.0467 35.3226C40.0209 35.7853 39.7994 36.0737 39.458 36.3678C39.6398 36.6859 40.2031 37.6873 40.3679 37.8835C40.1076 37.8671 39.7913 37.8765 39.5263 37.8779C39.3687 37.8797 39.1953 37.8737 39.0363 37.8713C38.8059 37.4595 38.5477 37.0325 38.3351 36.6144C38.2193 36.6203 38.0569 36.6191 37.9544 36.6612C37.9168 36.8724 37.9373 37.6347 37.9431 37.8774L36.7493 37.8755C36.7324 37.3799 36.6967 33.9966 36.7918 33.7185ZM38.7449 35.5963C38.882 35.3834 38.9991 34.9822 38.7195 34.8292C38.4748 34.6952 38.2158 34.7509 37.9501 34.729C37.877 35.5828 37.8037 35.7269 38.7449 35.5963Z" fill="black"/>
<path d="M29.6072 33.6765C30.4355 33.8521 31.4103 33.4913 32.1606 34.0205C32.4734 34.2426 32.6848 34.58 32.7483 34.9582C32.8901 35.8148 32.2667 36.5047 31.4351 36.6232C31.1487 36.6688 31.002 36.6583 30.7229 36.6243C30.7465 37.0004 30.7375 37.4874 30.7398 37.8721C30.3539 37.868 29.9741 37.8596 29.5886 37.8831C29.5445 37.5126 29.5256 33.8603 29.6072 33.6765ZM30.7298 35.6294C30.9407 35.6074 31.3418 35.6299 31.4699 35.5975C31.6278 35.3151 31.5867 35.1234 31.5291 34.815C31.2293 34.7354 31.0446 34.745 30.7367 34.7345C30.736 35.019 30.7434 35.3486 30.7298 35.6294Z" fill="black"/>
<path d="M34.013 33.7016C34.3997 33.699 34.6052 33.7059 34.981 33.7892C35.5228 34.9513 35.9554 36.6445 36.4374 37.8786C36.0617 37.8744 35.6861 37.8777 35.3106 37.8885C35.1823 37.614 35.0863 37.3451 35.0262 37.0482C33.9518 37.1232 33.9814 36.7343 33.7038 37.8624C33.3104 37.8649 32.9245 37.8659 32.5312 37.8839C32.8402 36.8504 33.2509 35.8256 33.5821 34.7977C33.6989 34.4355 33.8165 34.0271 34.013 33.7016ZM34.0843 36.3204C34.281 36.2912 34.3688 36.2793 34.5716 36.2817C34.6803 36.2774 34.7685 36.2957 34.8363 36.2385C34.7861 36.081 34.5406 35.2146 34.46 35.1603C34.343 35.5352 34.2218 35.9557 34.0843 36.3204Z" fill="black"/>
<path d="M43.3947 33.7299L43.8449 33.7076C43.8668 33.967 43.8587 34.4738 43.8617 34.75C43.457 34.7505 43.0523 34.7466 42.6476 34.7384C42.6781 35.7887 42.6365 36.8147 42.6803 37.8854C42.2962 37.8735 41.9409 37.8604 41.5564 37.8758C41.5168 37.6211 41.5178 37.4361 41.5152 37.1771C41.5144 36.4847 41.4829 35.3758 41.5328 34.7228L41.5203 34.7242C41.137 34.7656 40.7379 34.7518 40.3505 34.7507C40.3429 34.4927 40.298 33.9985 40.4174 33.791C40.5946 33.6992 42.9848 33.7325 43.3947 33.7299Z" fill="black"/>
<path d="M21.9487 33.7292L22.4093 33.705C22.4299 34.0121 22.4174 34.4462 22.4177 34.7626C22.0324 34.7459 21.5993 34.7503 21.2101 34.7466C21.256 35.7411 21.1995 36.8514 21.2382 37.8879C20.8653 37.872 20.492 37.8669 20.1188 37.8725C20.0787 37.6064 20.0796 37.4113 20.077 37.1408L20.0825 34.7268C19.8881 34.7394 19.4898 34.7321 19.322 34.7783C18.8361 34.9119 18.8492 34.0563 18.9733 33.803C19.1109 33.6811 21.6124 33.7302 21.9487 33.7292Z" fill="black"/>
<path d="M27.1376 35.7081C27.5326 35.8134 28.5515 35.7507 28.9853 35.7223C28.9808 36 29.0015 36.5043 28.956 36.7455C28.5668 36.8005 27.6137 36.7864 27.2004 36.7412C27.037 36.7234 27.0701 35.868 27.1376 35.7081Z" fill="black"/>
<path d="M29.1163 39.4703C29.2327 39.4459 29.3533 39.451 29.4671 39.4853C29.5807 39.5195 29.684 39.5817 29.7674 39.6661C30.0297 39.9317 30.0414 40.3551 29.7943 40.6348C29.7028 40.7383 29.583 40.8129 29.4497 40.8494C29.2414 40.9064 29.0185 40.8654 28.844 40.7381C28.6671 40.609 28.5598 40.4055 28.5531 40.1866C28.5463 39.9678 28.641 39.7581 28.8096 39.6184C28.8983 39.5449 29.0036 39.4941 29.1163 39.4703ZM29.3613 40.5384C29.6889 40.2665 29.6524 39.7915 29.1976 39.7758C29.1841 39.7754 29.1707 39.7753 29.1573 39.7755C28.8474 40.0684 28.8513 40.5641 29.3613 40.5384Z" fill="black"/>
<path d="M34.7969 39.4641C35.0678 39.4528 35.422 39.4594 35.4256 39.8144C35.261 40.0286 35.113 39.8833 34.9513 39.7578C34.6391 39.9465 34.601 39.9412 34.6292 40.3223C34.6889 40.4495 35.036 40.6109 35.1386 40.4488C35.0412 40.3603 34.9352 40.3035 34.9746 40.1724C35.0543 40.1177 35.1617 40.1122 35.259 40.0984C35.4024 40.1123 35.3782 40.0905 35.4854 40.1642C35.5818 40.3357 35.6892 40.6629 35.513 40.8185C35.2777 40.8654 34.8866 40.8275 34.6432 40.7885C34.4303 40.7544 34.335 40.5269 34.22 40.337C34.2129 40.2262 34.2196 40.0746 34.2214 39.9602C34.416 39.6283 34.4444 39.5743 34.7969 39.4641Z" fill="black"/>
<path d="M30.5915 39.4647C30.7987 39.4622 31.1486 39.4354 31.2541 39.6387C31.2257 39.8235 31.1212 39.8994 30.93 39.875C30.8479 39.8217 30.8179 39.7897 30.7217 39.7946L30.69 39.8376C30.7418 39.9322 30.8802 39.9685 30.9819 40.0265C31.4333 40.2843 31.5264 40.7284 30.9282 40.8611C30.7422 40.8845 30.3769 40.8613 30.2413 40.7192C30.2107 40.6095 30.2137 40.6555 30.2538 40.5288C30.439 40.3685 30.6332 40.5356 30.8531 40.4762C30.771 40.2498 30.3371 40.3304 30.2745 40.1274C30.1667 39.7777 30.2854 39.5764 30.5915 39.4647Z" fill="black"/>
<path d="M27.6373 40.0081C27.7717 39.7738 28.0122 39.3707 28.3396 39.4304L28.3657 39.4889C28.3262 39.7166 28.0854 39.9152 27.9207 40.082C28.0569 40.2587 28.2001 40.4339 28.309 40.6282C28.4064 40.7321 28.4056 40.7015 28.4316 40.8242C28.1917 41.1296 27.7489 40.4242 27.6531 40.2702C27.6311 40.4701 27.6334 40.7837 27.4156 40.8611C27.1568 40.7065 27.1751 39.6465 27.331 39.4205C27.4306 39.4465 27.4538 39.4504 27.5426 39.5083C27.623 39.6219 27.6218 39.8535 27.6373 40.0081Z" fill="black"/>
<path d="M33.0419 39.4368C33.1797 39.4295 33.8567 39.4765 33.9583 39.5284C33.9941 39.6471 33.9933 39.5983 33.9667 39.7146C33.8012 39.8625 33.4784 39.6432 33.3861 39.8536C33.5079 39.9984 33.7725 39.9327 33.9076 40.159C33.8267 40.3721 33.53 40.1881 33.3487 40.4506C33.598 40.4865 33.8488 40.4383 34.0177 40.6039C34.0481 40.6999 34.0523 40.6637 34.0125 40.741C33.8476 40.8531 33.288 40.8428 33.0126 40.8813C32.9737 40.6694 32.951 39.6276 33.0419 39.4368Z" fill="black"/>
<path d="M31.6806 39.4679C31.9465 39.4879 32.5658 39.3822 32.7134 39.5926C32.7068 39.7793 32.1856 40.3566 32.041 40.505C32.2293 40.5011 32.5743 40.4516 32.7006 40.6022C32.7393 40.7315 32.7267 40.7691 32.6177 40.8244C32.3569 40.8388 31.6839 40.9524 31.5626 40.6926C31.5791 40.4706 32.0819 39.9535 32.244 39.7663C32.0548 39.7803 31.6283 39.8563 31.5547 39.6429C31.5724 39.55 31.6103 39.5284 31.6806 39.4679Z" fill="black"/>
<path d="M24.7001 32.5181C24.9905 32.5095 25.3373 32.527 25.6441 32.5229C25.4711 32.7546 25.2368 33.1912 25.0798 33.4609C25.0294 33.5244 25.0218 33.5252 24.9481 33.5635C24.7566 33.5532 24.5145 33.4371 24.3262 33.3634C24.4034 33.0839 24.4685 32.6673 24.7001 32.5181Z" fill="black"/>
<path d="M27.8799 30.427C28.6496 30.3896 29.4174 30.3186 30.1808 30.2141C30.3964 30.3267 30.4745 30.1473 30.7142 30.3297C30.459 30.337 30.2985 30.3867 30.0737 30.3995C29.3291 30.4423 28.621 30.5299 27.875 30.4661L27.8799 30.427Z" fill="black"/>
<path d="M30.2285 25.8838C30.6947 25.8266 31.3054 25.8688 31.7825 25.8882L31.8101 25.9428L31.8785 25.9646L31.8454 26.0615C31.6226 26.0008 30.5791 25.9292 30.2285 25.8838Z" fill="black"/>
<path d="M29.1529 39.0289C29.2238 39.0548 29.2313 39.0598 29.2831 39.1147C29.2674 39.2411 29.195 39.2916 29.1051 39.4023L29.0067 39.3651L28.9805 39.2994C28.9998 39.1878 29.0779 39.1161 29.1529 39.0289Z" fill="black"/>
<path d="M29.4556 39.0289C29.5265 39.0548 29.534 39.0598 29.5858 39.1147C29.5701 39.2411 29.4977 39.2916 29.4078 39.4023L29.3095 39.3651L29.2832 39.2994C29.3025 39.1878 29.3807 39.1161 29.4556 39.0289Z" fill="black"/>
<defs>
<filter id="filter0_d_185_69" x="0.000391006" y="2.47955e-05" width="62.8" height="74.8" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="4"/>
<feGaussianBlur stdDeviation="6.45"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_185_69"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_185_69" result="shape"/>
</filter>
</defs>
</svg>`;
      btn.addEventListener("click", () => { setImgIndex(0); setActiveVenue(venue); });
      inner.appendChild(btn);
      wrapper.appendChild(inner);

      new maplibregl.Marker({ element: wrapper, anchor: "bottom", offset: [0, PIN_TIP_OFFSET] })
        .setLngLat([venue.lng, venue.lat])
        .addTo(map);
    });

    return () => { map.remove(); mapRef.current = null; pinElsRef.current = []; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly once both the map is loaded AND the handoff has been triggered.
  useEffect(() => {
    const map = mapRef.current;
    if (!fly || !mapLoaded || flownRef.current || !map || !primary) return;
    flownRef.current = true;
    // padding.bottom = 50% of container height → MapLibre places the focal
    // point (venue pin) at the centre of the top half = ~25% from top,
    // which is above the hero fade line on every screen size.
    const h = map.getContainer().clientHeight;
    map.flyTo({
      center: [primary.lng, primary.lat],
      zoom: 14,
      duration: 3000,
      curve: 1.5,
      essential: true,
      padding: { top: 0, bottom: Math.round(h * 0.5), left: 0, right: 0 },
    });
    // Bounce all pins in once the camera settles
    map.once("moveend", () => {
      pinElsRef.current.forEach((pin) => {
        if (!pin) return;
        pin.style.transition = "opacity 0.35s ease, transform 0.55s cubic-bezier(0.34,1.56,0.64,1)";
        pin.style.opacity = "1";
        pin.style.transform = "translateY(0) scale(1)";
      });
    });
  }, [fly, mapLoaded, primary]);

  return (
    <div className="absolute inset-0 h-full w-full">
      <style>{`
        @keyframes pinBob {
          0%, 100% { transform: translateY(0); }
          40%       { transform: translateY(-7px); }
          60%       { transform: translateY(-4px); }
        }
      `}</style>
      <div ref={containerRef} className="h-full w-full" />

      <Dialog open={!!activeVenue} onOpenChange={(o) => { if (!o) { setActiveVenue(null); setImgIndex(0); } }}>
        {activeVenue && (
          <DialogContent
            className="max-w-2xl overflow-hidden border-0 p-0"
            style={{ background: "#000", borderRadius: 36 }}
          >
            {/* visually hidden accessible title */}
            <DialogHeader className="sr-only">
              <DialogTitle>{activeVenue.name}</DialogTitle>
              <DialogDescription>{activeVenue.description[lang]}</DialogDescription>
            </DialogHeader>

            <button
              onClick={() => setActiveVenue(null)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 sm:h-[480px]">
              {/* ── Left: photo / carousel ── */}
              <div className="p-2 h-[260px] sm:h-auto">
                <div className="relative h-full overflow-hidden rounded-[27px] bg-[#262626]">
                  {activeVenue.images.length > 0 ? (
                    <>
                      {/* scroll-snap strip — swipe / scroll / auto-advance */}
                      <div
                        ref={carouselRef}
                        className="flex h-full"
                        style={{ overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                        onScroll={(e) => {
                          const el = e.currentTarget;
                          const idx = Math.round(el.scrollLeft / (el.clientWidth || 1));
                          setImgIndex(idx);
                        }}
                      >
                        {activeVenue.images.map((src, i) => (
                          <div key={i} className="relative flex-none w-full h-full overflow-hidden" style={{ scrollSnapAlign: "start" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={src}
                              alt={activeVenue.name}
                              className="absolute w-full max-w-none object-cover"
                              style={{ top: "-7.5%", height: "115%" }}
                            />
                          </div>
                        ))}
                      </div>
                      {/* dots */}
                      {activeVenue.images.length > 1 && (
                        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                          {activeVenue.images.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                carouselRef.current?.scrollTo({ left: i * (carouselRef.current.clientWidth || 1), behavior: "smooth" });
                              }}
                              className="h-1.5 rounded-full transition-all"
                              style={{
                                width: i === imgIndex ? 16 : 6,
                                background: i === imgIndex ? "#fff" : "rgba(255,255,255,0.35)",
                              }}
                              aria-label={`Image ${i + 1}`}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div
                        className="h-full w-full"
                        style={{ background: "radial-gradient(circle at 30% 20%, #3C7A1E 0%, #16170F 85%)" }}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/logo.svg" alt={activeVenue.name} className="absolute bottom-5 left-5 h-8 w-auto opacity-90" />
                    </>
                  )}
                  <div className="pointer-events-none absolute inset-0 rounded-[27px] shadow-[inset_0_0_0_1px_#262626]" />
                </div>
              </div>

              {/* ── Right: info ── */}
              <div className="flex flex-col overflow-hidden">
                <div className="relative flex-1 overflow-hidden">
                  <div className="h-full overflow-auto p-8">
                    <p className="mb-5 text-center text-base font-medium text-white">{activeVenue.name}</p>
                    <p className="text-[11px] leading-[1.5] text-[#E5E5E5]">{activeVenue.description[lang]}</p>
                  </div>
                  {/* fade to black */}
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black to-transparent" />
                </div>
                <div className="flex flex-col gap-2 p-4">
                  {activeVenue.eventSlug && (
                    <a
                      href={`/events/${activeVenue.eventSlug}`}
                      className="flex w-full items-center justify-center rounded-full py-3 text-base font-bold text-[#16170F] transition-opacity hover:opacity-90"
                      style={{ background: "#fff" }}
                    >
                      {dict["home.buy_tickets"]}
                    </a>
                  )}
                  <a
                    href={activeVenue.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center rounded-full py-3 text-base font-medium text-white transition-opacity hover:opacity-90"
                    style={{ background: "#1966FF" }}
                  >
                    {dict["location.directions"]}
                  </a>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
