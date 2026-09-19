using System;
using System.Windows.Media;
using System.Windows.Shapes;
using OotMapper.Model;
using OotMapper.Types;

namespace OotMapper.Display
{
	public class LinkDisplay
	{
		private const int LineShapeZ = 15;
		private Link _link;
		private MapDisplay _map;
		private Line _lineShape = null;
		private Line _lineShapeOutline;

		public Coord SourcePos => _map.GetEntrancePos(_link.Source);
		public Coord DestPos => _map.GetEntrancePos(_link.Dest);

		public LinkDisplay(MapDisplay map, Link link) {
			_map = map;
			_link = link;
		}

		public void Dispose() {
			_map.Remove(_lineShape);
			_map.Remove(_lineShapeOutline);
		}

		public void Refresh() {
			if (_lineShape is null) {
				Random r = new Random(_link.GetHashCode());
				byte red = (byte)r.Next(50, 256);
				byte blue = (byte)r.Next(50, 256);
				byte green = (byte)r.Next(50, 256);
				_lineShape = new Line {
					Stroke = new SolidColorBrush(Color.FromRgb(red, green, blue)),
					StrokeThickness = 5,
					StrokeStartLineCap = PenLineCap.Round,
					StrokeEndLineCap = PenLineCap.Round
				};
				_lineShapeOutline = new Line {
					Stroke = Brushes.Black,
					StrokeThickness = 9,
					StrokeStartLineCap = PenLineCap.Round,
					StrokeEndLineCap = PenLineCap.Round
				};
				_map.Add(_lineShape, LineShapeZ);
				_map.Add(_lineShapeOutline, LineShapeZ-1);
			}

			DrawLine(_lineShape);
			DrawLine(_lineShapeOutline);
		}

		private void DrawLine(Line line) {
			Coord vector = _map.View.SizeModelToView(DestPos - SourcePos);
			line.X1 = 0;
			line.Y1 = 0;
			line.X2 = vector.X;
			line.Y2 = vector.Y;
			_map.Move(line, _map.View.PosModelToView(SourcePos));
		}
	}
}
