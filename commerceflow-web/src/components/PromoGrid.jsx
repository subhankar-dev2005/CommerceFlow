import Container from './Container.jsx';
import PromoTile from './PromoTile.jsx';

/**
 * Featured Promotional Grid
 * Matches the reference image layout:
 * Left: Large Showcase tile
 * Middle: Stack of two tiles
 * Right: Full height tile
 */
export default function PromoGrid() {
  const getCatHref = (name) => `/shop?category=${encodeURIComponent(name)}`;

  return (
    <section aria-labelledby="featured-promos-heading" className="w-full">
      <Container>
        <h2 id="featured-promos-heading" className="sr-only">Featured Collections</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">

          {/* Column 1: Large Showcase Tile (Spans 2 columns on lg or 1 on md) */}
          <div className="md:col-span-2 lg:col-span-2">
            <PromoTile
              size="large"
              eyebrow="BEST SELLERS"
              title="Premium Camping Gear Collection"
              description="Trusted by outdoor enthusiasts worldwide. Built for wild weather, long treks, and serene campsites."
              cta="Shop Best Sellers"
              href="/shop"
              image="https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=1000&q=80"
              className="h-full"
            />
          </div>

          {/* Column 2: Stacked Middle Tiles (Tents & Sleeping Bags) */}
          <div className="flex flex-col gap-4 sm:gap-5 lg:col-span-1">
            <PromoTile
              size="standard"
              title="Tents & Shelters"
              description="Stay protected, stay comfortable in every climate."
              cta="Shop Now"
              href={getCatHref('Tents')}
              image="https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&w=600&q=80"
              className="flex-1"
            />
            <PromoTile
              size="standard"
              title="Sleeping Bags"
              description="Warmth and thermal insulation for high altitude adventures."
              cta="Shop Now"
              href={getCatHref('Sleeping Bags')}
              image="https://images.unsplash.com/photo-1517824806704-9040b037703b?auto=format&fit=crop&w=600&q=80"
              className="flex-1"
            />
          </div>

          {/* Column 3: Right Tile (Hiking Essentials) */}
          <div className="lg:col-span-1">
            <PromoTile
              size="large"
              eyebrow="TRAIL READY"
              title="Hiking Essentials"
              description="Trek poles, boots, and navigational gear for the trail."
              cta="Explore Trail"
              href={getCatHref('Hiking')}
              image="https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=600&q=80"
              className="h-full"
            />
          </div>

        </div>
      </Container>
    </section>
  );
}
