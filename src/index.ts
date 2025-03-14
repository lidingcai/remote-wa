import { spawn } from "child_process";
import { createSocket } from "dgram";
import { Server } from "ws";
import {
  MediaStreamTrack,
  RTCPeerConnection,
  RtpPacket,
  randomPort,
} from "werift";
import * as fs from "node:fs";
import { exit } from "node:process";

const XFolder = "/tmp/.X11-unix";
// very slow to print "start"
// get an unused display server number
const getDisplayNum = (minDisplayNum: number = 100) => {
  if (!fs.existsSync(XFolder)) {
    console.log("no file in /tmp/.X11-unix can not get a good display name");
    return 0;
  }
  let displayNum = minDisplayNum;
  fs.readdirSync(XFolder).forEach((file) => {
    console.log(`file=${file}`);
    if (file.match(/X[0-9]+/)) {
      const myDisplayNum = parseInt(file.substring(1));
      if (myDisplayNum >= displayNum) {
        displayNum = myDisplayNum + 1;
      }
    }
  });
  return displayNum;
};
const displayNum = getDisplayNum();
if (displayNum == 0) {
  exit(0);
}

const XvfbCommand = `:${displayNum}`;
const googleCommand = `https://web.whatsapp.com/ --window-position=0,0 --display=:${displayNum} --user-data-dir=/tmp/session${displayNum} --no-first-run --start-maximized --bwsi --force-dark-mode --disable-file-system --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage`;
console.log(`command = ${XvfbCommand}`);
spawn("/usr/bin/Xvfb", XvfbCommand.split(" "));
setTimeout(() => {
  console.log(`command = ${googleCommand}`);
  spawn("/usr/bin/google-chrome", googleCommand.split(" "));
}, 2000);
const server = new Server({ port: 8888 });
console.log("start");
server.on("connection", async (socket) => {
  const pc = new RTCPeerConnection({});
  const track = new MediaStreamTrack({ kind: "video" });
  randomPort().then((port) => {
    const udp = createSocket("udp4");
    udp.bind(port);
    const args = [
      `ximagesrc display-name=:${displayNum}.0 show-pointer=true use-damage=false`,
      `video/x-raw,framerate=25/1`,
      `videoconvert`,
      `queue`,
      `vp8enc target-bitrate=1996800 cpu-used=4 end-usage=cbr threads=4 deadline=1 undershoot=95 buffer-size=12288 buffer-initial-size=6144 buffer-optimal-size=9216 keyframe-max-dist=25 min-quantizer=4 max-quantizer=20`,
      "rtpvp8pay",
      `udpsink host=127.0.0.1 port=${port}`,
    ].join(" ! ");
    spawn("gst-launch-1.0", args.split(" "));
    udp.on("message", (data) => {
      console.log("new message");
      const rtp = RtpPacket.deSerialize(data);
      track.writeRtp(rtp);
    });
  });
  pc.addTransceiver(track, { direction: "sendonly" });

  await pc.setLocalDescription(await pc.createOffer());
  const sdp = JSON.stringify(pc.localDescription);
  socket.send(sdp);

  socket.on("message", (data: any) => {
    pc.setRemoteDescription(JSON.parse(data));
  });
});
