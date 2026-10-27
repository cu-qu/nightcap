import { toJpegMomentFile } from "@/src/photos/momentPhoto";

describe("toJpegMomentFile", () => {
  it("turns a picked photo into a jpeg file the API accepts", async () => {
    const file = await toJpegMomentFile("ph://asset-heic");

    expect(file).toEqual({
      uri: "file:///cache/moment.jpg",
      name: "moment.jpg",
      type: "image/jpeg",
    });
  });
});
