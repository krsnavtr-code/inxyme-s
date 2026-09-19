import BlogPost from "../model/BlogPost.js";
import Course from "../model/course.model.js";
import Category from "../model/category.model.js";
import Career from "../model/Career.js";
import FAQ from "../model/faq.model.js";

const generateSitemap = async (baseUrl, fallbackMode = false) => {
  try {
    // Only include publicly accessible pages that should be indexed by search engines
    // EXCLUDED: Admin routes, user dashboards, status/error pages, authentication pages, and authenticated-only pages
    const staticPages = [
      { url: "/", changefreq: "daily", priority: 1.0 },
      { url: "/courses", changefreq: "weekly", priority: 0.9 },
      { url: "/categories", changefreq: "weekly", priority: 0.8 },
      { url: "/free-course", changefreq: "weekly", priority: 0.8 },
      {
        url: "/courses/artificial-intelligence",
        changefreq: "weekly",
        priority: 0.8,
      },
      { url: "/courses/cloud", changefreq: "weekly", priority: 0.8 },
      { url: "/courses/cyber-security", changefreq: "weekly", priority: 0.8 },
      {
        url: "/courses/data-science-and-ml",
        changefreq: "weekly",
        priority: 0.8,
      },
      {
        url: "/courses/database-management-system",
        changefreq: "weekly",
        priority: 0.8,
      },
      {
        url: "/courses/digital-marketing",
        changefreq: "weekly",
        priority: 0.8,
      },
      { url: "/courses/erp-academy", changefreq: "weekly", priority: 0.8 },
      { url: "/courses/free-courses", changefreq: "weekly", priority: 0.8 },
      {
        url: "/courses/full-stack-development",
        changefreq: "weekly",
        priority: 0.8,
      },
      { url: "/courses/game-development", changefreq: "weekly", priority: 0.8 },
      {
        url: "/courses/management-system",
        changefreq: "weekly",
        priority: 0.8,
      },
      { url: "/courses/microsoft-azure", changefreq: "weekly", priority: 0.8 },
      {
        url: "/courses/mobile-app-development",
        changefreq: "weekly",
        priority: 0.8,
      },
      { url: "/courses/personality", changefreq: "weekly", priority: 0.8 },
      { url: "/courses/power-bi", changefreq: "weekly", priority: 0.8 },
      {
        url: "/courses/professional-language",
        changefreq: "weekly",
        priority: 0.8,
      },
      {
        url: "/courses/programming-languages",
        changefreq: "weekly",
        priority: 0.8,
      },
      { url: "/courses/saas-online", changefreq: "weekly", priority: 0.8 },
      {
        url: "/courses/salesforce-development",
        changefreq: "weekly",
        priority: 0.8,
      },
      { url: "/about", changefreq: "monthly", priority: 0.7 },
      { url: "/contact", changefreq: "monthly", priority: 0.7 },
      { url: "/blog", changefreq: "daily", priority: 0.8 },
      { url: "/faq", changefreq: "monthly", priority: 0.6 },
      { url: "/privacy-policy", changefreq: "monthly", priority: 0.5 },
      { url: "/terms-of-service", changefreq: "monthly", priority: 0.5 },
      {
        url: "/payment-terms-and-conditions",
        changefreq: "monthly",
        priority: 0.5,
      },
    ];

    const dynamicPages = [];

    if (!fallbackMode) {
      try {
        // Get published blog posts only
        const blogPosts = await BlogPost.find({ status: "published" })
          .select("slug updatedAt")
          .maxTimeMS(10000)
          .lean();
        blogPosts.forEach((post) => {
          if (post?.slug) {
            dynamicPages.push({
              url: `/blog/${post.slug}`,
              changefreq: "weekly",
              priority: 0.7,
              lastmod: post.updatedAt,
            });
          }
        });

        // Get only published courses (exclude drafts and unpublished courses)
        const courses = await Course.find({
          isPublished: true,
          status: { $ne: "draft" },
        })
          .select("slug updatedAt")
          .maxTimeMS(10000)
          .lean();
        courses.forEach((course) => {
          if (course?.slug) {
            dynamicPages.push({
              url: `/course/${course.slug}`,
              changefreq: "weekly",
              priority: 0.8,
              lastmod: course.updatedAt,
            });
          }
        });

        // Get active categories only
        const categories = await Category.find({ isActive: true })
          .select("slug updatedAt")
          .maxTimeMS(10000)
          .lean();
        categories.forEach((category) => {
          if (category?.slug) {
            dynamicPages.push({
              url: `/courses/${category.slug}`,
              changefreq: "weekly",
              priority: 0.6,
              lastmod: category.updatedAt,
            });
          }
        });

        // Get active careers (exclude drafts and ensure slug exists)
        const careers = await Career.find({ status: { $in: ["Open", "active"] } })
          .select("slug updatedAt")
          .maxTimeMS(10000)
          .lean();
        careers.forEach((career) => {
          if (career?.slug) {
            dynamicPages.push({
              url: `/careers/${career.slug}`,
              changefreq: "monthly",
              priority: 0.6,
              lastmod: career.updatedAt,
            });
          }
        });
      } catch (dbError) {
        console.warn(
          "Database query failed, using static pages only:",
          dbError.message,
        );
      }
    }

    // Deduplicate pages by URL (prefer dynamic with lastmod if available)
    const pageMap = new Map();
    staticPages.forEach((page) => {
      pageMap.set(page.url, page);
    });
    dynamicPages.forEach((page) => {
      pageMap.set(page.url, page);
    });

    // Generate XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    pageMap.forEach((page) => {
      xml += "  <url>\n";
      xml += `    <loc>${baseUrl}${page.url}</loc>\n`;
      if (page.lastmod) {
        xml += `    <lastmod>${new Date(page.lastmod).toISOString()}</lastmod>\n`;
      }
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += "  </url>\n";
    });

    xml += "</urlset>";

    return xml;
  } catch (error) {
    console.error("Error generating sitemap:", error);
    throw error;
  }
};

export default generateSitemap;
