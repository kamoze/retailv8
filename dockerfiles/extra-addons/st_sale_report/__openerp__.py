# -*- coding: utf-8 -*-
#/#############################################################################
#
#    Span Tree
#    Copyright (C) 2004-TODAY Span Tree(<http://www.spantreeng.com/>).
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
#/#############################################################################

{
    'name': 'Sale Reports',
    'version': '1.0',
    'category': 'sale',
    "sequence": 3,
    'description': """
        This module provide to print report for sale and invoice.
        1) Aged Sales Order Report
        2) Aged Sales Invoice Report
    """,
    'author': 'Span Tree',
    'website': 'http://www.spantreeng.com/',
    'images': [],
    'depends': ['sale', 'stock', 'base', 'account'],
    'update_xml': [],
    'css': [],
    'qweb': [],
    'js': [],
    'test': [],
    'data':["st_sale_view.xml", "wizard/aged_sale_report_wiz_view.xml",
            'wizard/aged_sale_invoice_report_wiz_view.xml'],
    'images': [],
    'installable': True,
    'auto_install': False,
    'application': True,
}
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
